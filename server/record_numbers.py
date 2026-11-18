"""Issue Carnation keepsake numbers and track aggregate visits."""

import argparse
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import partial
from hashlib import sha256
from hmac import compare_digest
from http.client import HTTPException
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3
from threading import Lock
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from unicodedata import category


API_PATH = "/api/record-number"
VISIT_PATH = "/api/visit"
STATS_PATH = "/api/visitor-stats"
WALL_PATH = "/api/wall-messages"
MUSIC_PATH = "/api/music/rain"
MUSIC_SOURCE_URL = (
    "https://interface.sina.cn/wap_api/video_location.d.html?cid=&table_id="
    "&did=niyqwtt0965785&vt=4&creator_id=9805&vid=60122948830&video_id=601229488"
    "&r=video.sina.cn%2Ffinance%2F2026-11-13%2Fdetail-iniyqwtt0965785.d.html"
)
MUSIC_USER_AGENT = "Carnation7 Music/1.0"
MUSIC_CHUNK_SIZE = 64 * 1024
WALL_CAPACITY = 122
PUBLIC_ORIGINS = {"https://lyn.lipopo.org", "https://gaonan.github.io"}
REQUEST_ID = re.compile(r"[0-9a-f]{32}")
SHANGHAI = timezone(timedelta(hours=8))
CHALLENGES = ("heart", "magazine", "role", "record")
CHALLENGE_EVENTS = {f"{challenge}-{stage}": (challenge, stage == "done")
                    for challenge in CHALLENGES for stage in ("start", "done")}


def validate_music_url(url):
    parts = urlsplit(url)
    host = parts.hostname or ""
    if (parts.scheme != "https" or parts.username or parts.password
            or parts.port not in (None, 443) or parts.fragment
            or not (host == "interface.sina.cn" or host.endswith(".weibocdn.com"))):
        raise ValueError("Unsupported music upstream")
    return url


def validate_music_range(value):
    if value is None:
        return None
    match = re.fullmatch(r"bytes=(\d{0,18})-(\d{0,18})", value)
    if not match or not any(match.groups()):
        raise ValueError("Invalid range")
    start, end = match.groups()
    if (not start and int(end) == 0) or (start and end and int(end) < int(start)):
        raise ValueError("Invalid range")
    return value


class MusicRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_music_url(newurl)
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and req.get_method() == "HEAD":
            redirected.method = "HEAD"
        return redirected


class MusicSource:
    """Resolve only the fixed public stage video, keeping no audio on disk."""
    def __init__(self, opener=None):
        self.opener = opener or build_opener(MusicRedirectHandler())
        self.lock = Lock()
        self.cached_url = None
        self.expires = 0

    def invalidate(self):
        with self.lock:
            self.cached_url = None
            self.expires = 0

    def open(self, method, byte_range):
        with self.lock:
            was_cached = self.cached_url is not None and monotonic() < self.expires
            url = self.cached_url if was_cached else MUSIC_SOURCE_URL
        headers = {"User-Agent": MUSIC_USER_AGENT, "Accept": "video/mp4", "Accept-Encoding": "identity"}
        if byte_range is not None:
            headers["Range"] = validate_music_range(byte_range)
        elif method == "HEAD":
            headers["Range"] = "bytes=0-0"
        response = None
        try:
            # This public CDN rejects HTTP HEAD. A metadata-only GET is opened
            # for HEAD and closed without reading its body by serve_music().
            request = Request(validate_music_url(url), headers=headers, method="GET" if method == "HEAD" else method)
            response = self.opener.open(request, timeout=10)
            final_url = validate_music_url(response.geturl())
            length = response.headers.get("Content-Length", "")
            if (response.status not in (200, 206)
                    or response.headers.get_content_type() != "video/mp4"
                    or not re.fullmatch(r"\d{1,12}", length) or int(length) == 0):
                raise ValueError("Invalid music response")
            if response.status == 206:
                partial = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
                if not partial:
                    raise ValueError("Missing music range")
                start, end, total = map(int, partial.groups())
                if not 0 <= start <= end < total or end - start + 1 != int(length):
                    raise ValueError("Invalid music response range")
                if method == "HEAD" and byte_range is None:
                    response.status = 200
                    response.headers.replace_header("Content-Length", str(total))
                    del response.headers["Content-Range"]
            with self.lock:
                if not was_cached or self.cached_url != final_url:
                    self.expires = monotonic() + 60
                self.cached_url = final_url
            return response
        except Exception:
            if response is not None:
                response.close()
            self.invalidate()
            raise


def initialize(database):
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS record_number (
                number INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL UNIQUE
            )
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS wall_message (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number INTEGER NOT NULL UNIQUE REFERENCES record_number(number),
                text TEXT NOT NULL
            )
        """)


def issue(database, request_id):
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        prior = connection.execute(
            "SELECT number FROM record_number WHERE request_id = ?", (request_id,)
        ).fetchone()
        if prior:
            return prior[0]
        cursor = connection.execute("INSERT INTO record_number(request_id) VALUES (?)", (request_id,))
        return cursor.lastrowid


def publish_message(database, request_id, raw_text):
    if not isinstance(raw_text, str):
        raise ValueError
    text = " ".join(raw_text.split())
    if not text or len(text) > 200 or any(category(char).startswith("C") and char != "\u200d" for char in text):
        raise ValueError
    # Count marks and joined emoji with their base character.
    length = 0
    previous = ""
    regionals = 0
    for char in text:
        regional = "\U0001f1e6" <= char <= "\U0001f1ff"
        if char != "\u200d" and previous != "\u200d" and not category(char).startswith("M"):
            if not "\U0001f3fb" <= char <= "\U0001f3ff" and not (regional and regionals % 2):
                length += 1
        regionals = regionals + 1 if regional else 0
        previous = char
    if not 1 <= length <= 50:
        raise ValueError
    with closing(sqlite3.connect(database)) as connection, connection:
        cursor = connection.execute("""
            INSERT INTO wall_message (number, text)
            SELECT number, ? FROM record_number WHERE request_id = ?
            ON CONFLICT(number) DO UPDATE SET text = excluded.text
        """, (text, request_id))
        return cursor.rowcount == 1


def wall_messages(database):
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("BEGIN")
        total = connection.execute("SELECT COUNT(*) FROM wall_message").fetchone()[0]
        if total <= WALL_CAPACITY:
            rows = connection.execute("SELECT id, text FROM wall_message ORDER BY id DESC").fetchall()
        else:
            rows = connection.execute("SELECT id, text FROM wall_message ORDER BY RANDOM() LIMIT ?",
                                      (WALL_CAPACITY,)).fetchall()
    return {"messages": [{"id": id_, "text": text} for id_, text in rows], "total": total}


def wall_message_register(database):
    with closing(sqlite3.connect(database)) as connection:
        rows = connection.execute("SELECT number, text FROM wall_message ORDER BY number").fetchall()
    return {"messages": [{"number": number, "text": text} for number, text in rows]}


def initialize_visits(database):
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS visit (
                page_id TEXT PRIMARY KEY,
                visitor TEXT NOT NULL,
                day TEXT NOT NULL,
                entered INTEGER NOT NULL
            ) WITHOUT ROWID
        """)
        connection.execute("CREATE INDEX IF NOT EXISTS visit_by_day ON visit(day, visitor)")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS visit_milestone (
                page_id TEXT PRIMARY KEY REFERENCES visit(page_id),
                ready INTEGER NOT NULL,
                failed INTEGER NOT NULL,
                first_collection INTEGER NOT NULL
            ) WITHOUT ROWID
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS challenge_progress (
                visitor TEXT NOT NULL,
                challenge TEXT NOT NULL,
                started_day TEXT NOT NULL,
                completed_day TEXT,
                PRIMARY KEY (visitor, challenge)
            ) WITHOUT ROWID
        """)
        connection.execute("CREATE TABLE IF NOT EXISTS visit_start (day TEXT NOT NULL)")
        connection.execute(
            "INSERT INTO visit_start SELECT ? WHERE NOT EXISTS (SELECT 1 FROM visit_start)",
            (datetime.now(SHANGHAI).date().isoformat(),),
        )


def log_visit(database, origin, payload):
    base_keys = {"visitorId", "pageId", "event"}
    tracked = set(payload) == base_keys | {"v"} and payload["v"] == 2
    if not tracked and set(payload) != base_keys:
        raise ValueError
    visitor_id, page_id, event = (payload[key] for key in ("visitorId", "pageId", "event"))
    if not all(isinstance(value, str) and REQUEST_ID.fullmatch(value) for value in (visitor_id, page_id)):
        raise ValueError
    if not isinstance(event, str):
        raise ValueError
    challenge_event = CHALLENGE_EVENTS.get(event) if tracked else None
    if not challenge_event and event not in (("open", "enter", "ready", "load-failed", "first-collection")
                                            if tracked else ("open", "enter")):
        raise ValueError
    visitor = sha256(f"{origin}:{visitor_id}".encode()).hexdigest()
    page = sha256(page_id.encode()).hexdigest()
    day = datetime.now(SHANGHAI).date().isoformat()
    with closing(sqlite3.connect(database)) as connection, connection:
        if challenge_event:
            challenge, completed = challenge_event
            connection.execute("""
                INSERT INTO challenge_progress VALUES (?, ?, ?, ?)
                ON CONFLICT(visitor, challenge) DO UPDATE SET
                    completed_day = COALESCE(challenge_progress.completed_day, excluded.completed_day)
            """, (visitor, challenge, day, day if completed else None))
            return
        cursor = connection.execute("""
            INSERT INTO visit VALUES (?, ?, ?, ?)
            ON CONFLICT(page_id) DO UPDATE SET entered = MAX(visit.entered, excluded.entered)
            WHERE visit.visitor = excluded.visitor
        """, (page, visitor, day, int(event in ("enter", "first-collection"))))
        if tracked and cursor.rowcount:
            connection.execute("""
                INSERT INTO visit_milestone VALUES (?, ?, ?, ?)
                ON CONFLICT(page_id) DO UPDATE SET
                    ready = MAX(visit_milestone.ready, excluded.ready),
                    failed = MAX(visit_milestone.failed, excluded.failed),
                    first_collection = MAX(visit_milestone.first_collection, excluded.first_collection)
            """, (page, int(event in ("ready", "enter", "first-collection")),
                  int(event == "load-failed"), int(event == "first-collection")))


def visitor_stats(database):
    today = datetime.now(SHANGHAI).date()
    days = [(today - timedelta(days=n)).isoformat() for n in range(6, -1, -1)]
    fields = ("visitors", "opens", "enters", "tracked", "ready", "failed", "tracked_enters", "first_collection")
    counters = """
        COUNT(DISTINCT visitor), COUNT(*), COALESCE(SUM(entered), 0), COUNT(m.page_id),
        COALESCE(SUM(m.ready), 0), COALESCE(SUM(m.failed * (1 - m.ready)), 0),
        COALESCE(SUM(entered * m.ready), 0), COALESCE(SUM(m.first_collection), 0)
    """
    visits = "visit LEFT JOIN visit_milestone AS m USING (page_id)"
    challenge_fields = ("started", "completed", "today_started", "today_completed")
    challenges = {name: dict.fromkeys(challenge_fields, 0) for name in CHALLENGES}
    with closing(sqlite3.connect(database)) as connection:
        start = connection.execute("SELECT day FROM visit_start").fetchone()[0]
        total = dict(zip(fields, connection.execute(f"SELECT {counters} FROM {visits}").fetchone()))
        recent = {day: dict(zip(fields, row)) for day, *row in connection.execute(
            f"SELECT day, {counters} FROM {visits} WHERE day >= ? GROUP BY day", (days[0],)
        )}
        for name, *counts in connection.execute("""
            SELECT challenge, COUNT(*), COUNT(completed_day), SUM(started_day = ?),
                SUM(started_day = ? AND completed_day IS NOT NULL)
            FROM challenge_progress GROUP BY challenge
        """, (days[-1], days[-1])):
            challenges[name] = dict(zip(challenge_fields, counts))
    return {"total": total, "challenges": challenges, "days": [
        {"day": day, **recent.get(day, dict.fromkeys(fields, 0))} for day in days if day >= start
    ]}


class RecordHandler(SimpleHTTPRequestHandler):
    @property
    def endpoint(self):
        return urlsplit(self.path).path

    def respond(self, status, payload=None, extra_headers=()):
        data = json.dumps(payload).encode() if payload is not None else b""
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Origin")
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            music = self.endpoint == MUSIC_PATH
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS" if music else "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Range" if music else "Content-Type")
            if music:
                self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
        if data:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for name, value in extra_headers:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD" and data:
            self.wfile.write(data)

    def do_GET(self):
        if self.endpoint == MUSIC_PATH:
            return self.serve_music()
        if self.endpoint == WALL_PATH:
            try:
                return self.respond(200, wall_messages(self.server.database))
            except sqlite3.Error:
                return self.respond(503, {"error": "temporarily_unavailable"})
        if self.endpoint == STATS_PATH:
            key = self.server.stats_key
            auth = self.headers.get("Authorization", "").encode()
            if not key or not compare_digest(auth, b"Bearer " + key):
                return self.respond(401, {"error": "key_required"})
            try:
                if urlsplit(self.path).query == "view=messages":
                    return self.respond(200, wall_message_register(self.server.database))
                return self.respond(200, visitor_stats(self.server.visits_database))
            except sqlite3.Error:
                return self.respond(503, {"error": "temporarily_unavailable"})
        if self.endpoint != API_PATH:
            if self.server.serve_static:
                return super().do_GET()
            return self.respond(404, {"error": "not_found"})
        try:
            with closing(sqlite3.connect(self.server.database)) as connection:
                latest = connection.execute("SELECT MAX(number) FROM record_number").fetchone()[0]
        except sqlite3.Error:
            return self.respond(503, {"error": "temporarily_unavailable"})
        self.respond(200, {"latest": latest})

    def do_HEAD(self):
        if self.endpoint not in (API_PATH, STATS_PATH, VISIT_PATH, WALL_PATH, MUSIC_PATH) and self.server.serve_static:
            return super().do_HEAD()
        self.do_GET()

    def do_OPTIONS(self):
        if self.endpoint not in (API_PATH, VISIT_PATH, WALL_PATH, MUSIC_PATH):
            return self.respond(404, {"error": "not_found"})
        if self.headers.get("Origin") not in self.server.allowed_origins:
            return self.respond(403, {"error": "origin_not_allowed"})
        self.respond(204)

    def do_POST(self):
        endpoint = self.endpoint
        if endpoint == MUSIC_PATH:
            return self.respond(405, {"error": "method_not_allowed"})
        if endpoint not in (API_PATH, VISIT_PATH, WALL_PATH):
            return self.respond(404, {"error": "not_found"})
        origin = self.headers.get("Origin")
        if origin not in self.server.allowed_origins:
            return self.respond(403, {"error": "origin_not_allowed"})
        if self.headers.get_content_type() != "application/json":
            return self.respond(415, {"error": "json_required"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 1 <= size <= (1200 if endpoint == WALL_PATH else 128):
                raise ValueError
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError
            if endpoint == VISIT_PATH:
                log_visit(self.server.visits_database, origin, payload)
                return self.respond(204)
            request_id = payload.get("requestId")
            if not isinstance(request_id, str) or not REQUEST_ID.fullmatch(request_id):
                raise ValueError
            if endpoint == WALL_PATH:
                if set(payload) != {"requestId", "text"}:
                    raise ValueError
                if not publish_message(self.server.database, request_id, payload["text"]):
                    return self.respond(404, {"error": "record_not_found"})
                return self.respond(204)
            if set(payload) != {"requestId"}:
                raise ValueError
            number = issue(self.server.database, request_id)
        except (ValueError, TimeoutError):
            return self.respond(400, {"error": "invalid_request"})
        except sqlite3.Error:
            return self.respond(503, {"error": "temporarily_unavailable"})
        self.respond(200, {"number": number})

    def serve_music(self):
        origin = self.headers.get("Origin")
        if origin and origin not in self.server.allowed_origins:
            return self.respond(403, {"error": "origin_not_allowed"})
        try:
            if urlsplit(self.path).query or len(self.headers.get_all("Range", [])) > 1:
                raise ValueError("Invalid music request")
            byte_range = validate_music_range(self.headers.get("Range"))
        except ValueError:
            return self.respond(400, {"error": "invalid_range"})

        upstream = None
        try:
            upstream = self.server.music_source.open(self.command, byte_range)
            remaining = int(upstream.headers["Content-Length"])
            # Bound the initial read and detect an unavailable stream before
            # committing the response headers. HEAD never consumes video bytes.
            chunk = b"" if self.command == "HEAD" else upstream.read(min(MUSIC_CHUNK_SIZE, remaining))
            if self.command != "HEAD" and not chunk:
                raise OSError("Empty music stream")
        except (HTTPError, URLError, OSError, ValueError, HTTPException) as error:
            if upstream is not None:
                upstream.close()
            self.server.music_source.invalidate()
            if isinstance(error, HTTPError):
                content_range = error.headers.get("Content-Range", "") if error.headers else ""
                error.close()
                if error.code == 416:
                    headers = [("Content-Range", content_range)] if re.fullmatch(r"bytes \*/\d+", content_range) else ()
                    return self.respond(416, {"error": "range_not_satisfiable"}, headers)
            return self.respond(503, {"error": "music_temporarily_unavailable"})

        try:
            self.send_response(upstream.status)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(remaining))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Vary", "Origin")
            if upstream.status == 206:
                self.send_header("Content-Range", upstream.headers["Content-Range"])
            if origin in self.server.allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Range")
                self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
            self.end_headers()
            if self.command == "HEAD":
                return
            while chunk:
                self.wfile.write(chunk)
                remaining -= len(chunk)
                if remaining <= 0:
                    break
                chunk = upstream.read(min(MUSIC_CHUNK_SIZE, remaining))
            if remaining:
                self.close_connection = True
                self.server.music_source.invalidate()
        except (OSError, HTTPException):
            # An interrupted listener owns no persistent upstream connection.
            self.close_connection = True
            self.server.music_source.invalidate()
        finally:
            upstream.close()


class RecordServer(ThreadingHTTPServer):
    request_queue_size = 64

    def __init__(self, address, database, static_root=None, stats_key=None):
        initialize(database)
        self.database = database
        self.visits_database = Path(database).with_name("visits.sqlite3")
        initialize_visits(self.visits_database)
        self.stats_key = stats_key
        self.serve_static = static_root is not None
        self.allowed_origins = set(PUBLIC_ORIGINS)
        self.music_source = MusicSource()
        super().__init__(address, partial(RecordHandler, directory=static_root))
        if self.serve_static:
            self.allowed_origins.update(f"http://{host}:{self.server_port}" for host in ("localhost", "127.0.0.1"))

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(10)
        return connection, address


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8713)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--static-root", type=Path)
    parser.add_argument("--stats-key-file", type=Path)
    args = parser.parse_args()
    args.database.parent.mkdir(parents=True, exist_ok=True)
    key_file = args.stats_key_file
    if not key_file and "CREDENTIALS_DIRECTORY" in os.environ:
        key_file = Path(os.environ["CREDENTIALS_DIRECTORY"]) / "visitor-stats-key"
    stats_key = key_file.read_bytes().strip() if key_file else None
    with RecordServer(("127.0.0.1", args.port), args.database, args.static_root, stats_key) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
