from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server.record_numbers import API_PATH, RecordServer


MAIN = "https://lyn.lipopo.org"
MIRROR = "https://gaonan.github.io"


@contextmanager
def running_server(database):
    with RecordServer(("127.0.0.1", 0), database) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}{API_PATH}"
        finally:
            server.shutdown()
            thread.join()


def request(url, *, origin=MAIN, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {"Origin": origin, "Content-Type": "application/json"}
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


if __name__ == "__main__":
    unittest.main()
