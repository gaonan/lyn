"""Issue Carnation keepsake numbers and track aggregate visits."""

import argparse
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import partial
from hashlib import sha256
from hmac import compare_digest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit


API_PATH = "/api/record-number"
VISIT_PATH = "/api/visit"
STATS_PATH = "/api/visitor-stats"
PUBLIC_ORIGINS = {"https://lyn.lipopo.org", "https://gaonan.github.io"}
REQUEST_ID = re.compile(r"[0-9a-f]{32}")
SHANGHAI = timezone(timedelta(hours=8))


def initialize(database):
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS record_number (
                number INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL UNIQUE
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
    if event not in (("open", "enter", "ready", "load-failed", "first-collection") if tracked else ("open", "enter")):
        raise ValueError
    visitor = sha256(f"{origin}:{visitor_id}".encode()).hexdigest()
    page = sha256(page_id.encode()).hexdigest()
    day = datetime.now(SHANGHAI).date().isoformat()
    with closing(sqlite3.connect(database)) as connection, connection:
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
    with closing(sqlite3.connect(database)) as connection:
        start = connection.execute("SELECT day FROM visit_start").fetchone()[0]
        total = dict(zip(fields, connection.execute(f"SELECT {counters} FROM {visits}").fetchone()))
        recent = {day: dict(zip(fields, row)) for day, *row in connection.execute(
            f"SELECT day, {counters} FROM {visits} WHERE day >= ? GROUP BY day", (days[0],)
        )}
    return {"total": total, "days": [
        {"day": day, **recent.get(day, dict.fromkeys(fields, 0))} for day in days if day >= start
    ]}


class RecordHandler(SimpleHTTPRequestHandler):
    @property
    def endpoint(self):
        return urlsplit(self.path).path

    def respond(self, status, payload=None):
        data = json.dumps(payload).encode() if payload is not None else b""
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Origin")
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if data:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD" and data:
            self.wfile.write(data)

    def do_GET(self):
        if self.endpoint == STATS_PATH:
            key = self.server.stats_key
            auth = self.headers.get("Authorization", "").encode()
            if not key or not compare_digest(auth, b"Bearer " + key):
                return self.respond(401, {"error": "key_required"})
            try:
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
        if self.endpoint not in (API_PATH, STATS_PATH, VISIT_PATH) and self.server.serve_static:
            return super().do_HEAD()
        self.do_GET()

    def do_OPTIONS(self):
        if self.endpoint not in (API_PATH, VISIT_PATH):
            return self.respond(404, {"error": "not_found"})
        if self.headers.get("Origin") not in self.server.allowed_origins:
            return self.respond(403, {"error": "origin_not_allowed"})
        self.respond(204)

    def do_POST(self):
        endpoint = self.endpoint
        if endpoint not in (API_PATH, VISIT_PATH):
            return self.respond(404, {"error": "not_found"})
        origin = self.headers.get("Origin")
        if origin not in self.server.allowed_origins:
            return self.respond(403, {"error": "origin_not_allowed"})
        if self.headers.get_content_type() != "application/json":
            return self.respond(415, {"error": "json_required"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 1 <= size <= 128:
                raise ValueError
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError
            if endpoint == VISIT_PATH:
                log_visit(self.server.visits_database, origin, payload)
                return self.respond(204)
            request_id = payload.get("requestId")
            if not isinstance(request_id, str) or not REQUEST_ID.fullmatch(request_id) or len(payload) != 1:
                raise ValueError
            number = issue(self.server.database, request_id)
        except (ValueError, TimeoutError):
            return self.respond(400, {"error": "invalid_request"})
        except sqlite3.Error:
            return self.respond(503, {"error": "temporarily_unavailable"})
        self.respond(200, {"number": number})


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
