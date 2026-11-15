"""Issue a shared serial for each numbered Carnation keepsake."""

import argparse
from contextlib import closing
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit


API_PATH = "/api/record-number"
PUBLIC_ORIGINS = {"https://lyn.lipopo.org", "https://gaonan.github.io"}
REQUEST_ID = re.compile(r"[0-9a-f]{32}")


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


class RecordHandler(SimpleHTTPRequestHandler):
    @property
    def is_api(self):
        return urlsplit(self.path).path == API_PATH

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
        if not self.is_api:
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
        if not self.is_api and self.server.serve_static:
            return super().do_HEAD()
        self.do_GET()

    def do_OPTIONS(self):
        if not self.is_api:
            return self.respond(404, {"error": "not_found"})
        if self.headers.get("Origin") not in self.server.allowed_origins:
            return self.respond(403, {"error": "origin_not_allowed"})
        self.respond(204)

    def do_POST(self):
        if not self.is_api:
            return self.respond(404, {"error": "not_found"})
        if self.headers.get("Origin") not in self.server.allowed_origins:
            return self.respond(403, {"error": "origin_not_allowed"})
        if self.headers.get_content_type() != "application/json":
            return self.respond(415, {"error": "json_required"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 1 <= size <= 128:
                raise ValueError
            payload = json.loads(self.rfile.read(size))
            request_id = payload.get("requestId") if isinstance(payload, dict) else None
            if not isinstance(request_id, str) or not REQUEST_ID.fullmatch(request_id) or len(payload) != 1:
                raise ValueError
        except (ValueError, TimeoutError):
            return self.respond(400, {"error": "invalid_request"})
        try:
            number = issue(self.server.database, request_id)
        except sqlite3.Error:
            return self.respond(503, {"error": "temporarily_unavailable"})
        self.respond(200, {"number": number})


class RecordServer(ThreadingHTTPServer):
    request_queue_size = 64

    def __init__(self, address, database, static_root=None):
        initialize(database)
        self.database = database
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
    args = parser.parse_args()
    args.database.parent.mkdir(parents=True, exist_ok=True)
    with RecordServer(("127.0.0.1", args.port), args.database, args.static_root) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
