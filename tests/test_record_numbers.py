from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server.record_numbers import API_PATH, RecordServer


MAIN = "https://lyn.lipopo.org"
MIRROR = "https://gaonan.github.io"


@contextmanager
def running_server(database, stats_key=None):
    with RecordServer(("127.0.0.1", 0), database, stats_key=stats_key) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}{API_PATH}"
        finally:
            server.shutdown()
            thread.join()


def request(url, *, origin=MAIN, method="GET", payload=None, key=None):
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    headers = {"Origin": origin, "Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        response = urlopen(Request(url, data=data, headers=headers, method=method), timeout=10)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        return response.status, response.headers, json.loads(body) if body else None


def claim(url, request_id, origin=MAIN):
    status, headers, body = request(url, origin=origin, method="POST", payload={"requestId": request_id})
    assert status == 200, body
    assert headers["Access-Control-Allow-Origin"] == origin
    return body["number"]


class RecordNumbersTests(unittest.TestCase):
    def setUp(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.database = Path(tmp.name) / "records.sqlite3"

    def test_both_origins_share_a_contiguous_sequence_even_under_concurrency(self):
        with running_server(self.database) as url:
            self.assertEqual(request(url)[2], {"latest": None})
            with ThreadPoolExecutor(max_workers=12) as pool:
                results = list(pool.map(
                    lambda value: claim(url, f"{value:032x}", MIRROR if value % 2 else MAIN),
                    range(1, 33),
                ))
                self.assertEqual(sorted(results), list(range(1, 33)))
                retried = list(pool.map(lambda _: claim(url, "f" * 32, MIRROR), range(8)))
            self.assertEqual(retried, [33] * 8)
            self.assertEqual(request(url)[2], {"latest": 33})
        with running_server(self.database) as url:
            self.assertEqual(claim(url, "f" * 32), 33)
            self.assertEqual(claim(url, "e" * 32), 34)

    def test_invalid_requests_do_not_allocate_and_mirror_can_preflight(self):
        with running_server(self.database) as url:
            status, headers, _ = request(url, origin=MIRROR, method="OPTIONS")
            self.assertEqual(status, 204)
            self.assertEqual(headers["Access-Control-Allow-Origin"], MIRROR)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(request(url, origin="https://example.org", method="POST",
                                     payload={"requestId": "a" * 32})[0], 403)
            self.assertEqual(request(url, method="POST",
                                     payload={"requestId": "a" * 32, "text": "local"})[0], 400)
            self.assertEqual(claim(url, "a" * 32), 1)

    def test_visits_deduplicate_pages_and_browser_per_site_without_affecting_records(self):
        key = "a" * 64
        with running_server(self.database, stats_key=key.encode()) as url:
            visit_url = url.replace(API_PATH, "/api/visit")
            stats_url = url.replace(API_PATH, "/api/visitor-stats")
            for page, event, origin in (
                ("1", "enter", MAIN), ("1", "open", MAIN), ("1", "enter", MAIN),
                ("2", "open", MAIN), ("3", "open", MIRROR),
            ):
                payload = {"visitorId": "a" * 32, "pageId": page * 32, "event": event}
                self.assertEqual(request(visit_url, origin=origin, method="POST", payload=payload)[0], 204)
            self.assertEqual(request(stats_url)[0], 401)
            self.assertEqual(request(stats_url, key="b" * 64)[0], 401)
            status, headers, stats = request(stats_url, key=key)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual({key: stats["total"][key] for key in ("visitors", "opens", "enters")},
                             {"visitors": 2, "opens": 3, "enters": 1})
            self.assertEqual(stats["total"]["tracked"], 0)
            self.assertEqual(len(stats["days"]), 1)
            self.assertEqual(stats["days"][-1]["opens"], 3)
            self.assertIsNone(request(url)[2]["latest"])

    def test_funnel_migrates_legacy_counts_and_deduplicates_reordered_events(self):
        key = "a" * 64
        with running_server(self.database) as url:
            event = {"visitorId": "a" * 32, "pageId": "1" * 32, "event": "enter"}
            self.assertEqual(request(url.replace(API_PATH, "/api/visit"), method="POST", payload=event)[0], 204)
            self.assertEqual(claim(url, "1" * 32), 1)
        with sqlite3.connect(self.database.with_name("visits.sqlite3")) as connection:
            connection.execute("DROP TABLE visit_milestone")
        with running_server(self.database, stats_key=key.encode()) as url:
            for page, event, origin in (
                ("2", "first-collection", MAIN), ("2", "first-collection", MAIN),
                ("2", "open", MAIN), ("2", "load-failed", MAIN),
                ("3", "load-failed", MIRROR), ("3", "open", MIRROR),
                ("4", "ready", MAIN), ("5", "open", MAIN),
            ):
                payload = {"visitorId": "a" * 32, "pageId": page * 32, "event": event, "v": 2}
                self.assertEqual(request(url.replace(API_PATH, "/api/visit"), origin=origin,
                                         method="POST", payload=payload)[0], 204)
            stats = request(url.replace(API_PATH, "/api/visitor-stats"), key=key)[2]
            self.assertEqual(stats["total"], {
                "visitors": 2, "opens": 5, "enters": 2, "tracked": 4, "ready": 2,
                "failed": 1, "tracked_enters": 1, "first_collection": 1,
            })
            self.assertEqual(stats["days"][-1]["first_collection"], 1)
            self.assertEqual(request(url)[2], {"latest": 1})

    def test_challenge_funnels_are_independent_and_deduplicate_across_page_reloads(self):
        key = "a" * 64
        with running_server(self.database, stats_key=key.encode()) as url:
            visit_url = url.replace(API_PATH, "/api/visit")
            for visitor, page, event, origin in (
                ("a", "1", "heart-start", MAIN), ("a", "2", "heart-start", MAIN),
                ("b", "3", "heart-done", MAIN), ("b", "4", "heart-done", MAIN),
                ("a", "5", "heart-start", MIRROR), ("a", "1", "magazine-done", MAIN),
                ("a", "1", "role-start", MAIN), ("a", "1", "record-done", MAIN),
                ("a", "2", "record-start", MAIN),
            ):
                payload = {"visitorId": visitor * 32, "pageId": page * 32, "event": event, "v": 2}
                self.assertEqual(request(visit_url, origin=origin, method="POST", payload=payload)[0], 204)
            stats = request(url.replace(API_PATH, "/api/visitor-stats"), key=key)[2]
            for challenge, (started, completed) in {
                "heart": (3, 1), "magazine": (1, 1), "role": (1, 0), "record": (1, 1),
            }.items():
                self.assertEqual(stats["challenges"][challenge], {
                    "started": started, "completed": completed,
                    "today_started": started, "today_completed": completed,
                })
            self.assertEqual(stats["total"]["opens"], 0)
            self.assertEqual(request(url)[2], {"latest": None})

    def test_wall_requires_issued_number_and_samples_a_shared_pool(self):
        key = "1" * 64
        with running_server(self.database, stats_key=key.encode()) as url:
            wall_url = url.replace(API_PATH, "/api/wall-messages")
            self.assertEqual(request(wall_url)[2], {"messages": [], "total": 0})
            self.assertEqual(request(wall_url, origin=MIRROR, method="OPTIONS")[0], 204)
            self.assertEqual(request(wall_url, method="POST", payload={"requestId": "a" * 32, "text": "未发号"})[0], 404)
            for number in range(1, 75):
                request_id = f"{number:032x}"
                self.assertEqual(claim(url, request_id), number)
                payload = {"requestId": request_id, "text": f" 留言 {number} "}
                self.assertEqual(request(wall_url, origin=MIRROR, method="POST", payload=payload)[0], 204)
                if number == 3:
                    self.assertEqual([entry["text"] for entry in request(wall_url)[2]["messages"]],
                                     ["留言 3", "留言 2", "留言 1"])
            request_id = f"{75:032x}"
            self.assertEqual(claim(url, request_id), 75)
            emoji_at_limit = "花" * 49 + "👩‍👩‍👦"
            self.assertEqual(request(wall_url, method="POST", payload={"requestId": request_id, "text": emoji_at_limit})[0], 204)
            self.assertEqual(request(wall_url, method="POST", payload={"requestId": request_id, "text": "花" * 51})[0], 400)
            self.assertEqual(request(wall_url, method="POST", payload={"requestId": request_id, "text": emoji_at_limit})[0], 204)
            wall = request(wall_url)[2]
            self.assertEqual(wall["total"], 75)
            self.assertEqual(len({entry['id'] for entry in wall['messages']}), 70)
            self.assertTrue(all(set(entry) == {"id", "text"} for entry in wall["messages"]))
            self.assertEqual(request(url)[2], {"latest": 75})
            register = url.replace(API_PATH, "/api/visitor-stats?view=messages")
            self.assertEqual(request(register)[0], 401)
            self.assertEqual(request(register, key="2" * 64)[0], 401)
            self.assertEqual(request(register, key=key)[2], {"messages": [
                {"number": number, "text": f"留言 {number}" if number < 75 else emoji_at_limit}
                for number in range(1, 76)
            ]})


if __name__ == "__main__":
    unittest.main()
