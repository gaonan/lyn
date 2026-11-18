from contextlib import contextmanager
from email.message import Message
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from server.record_numbers import (
    API_PATH, MUSIC_CHUNK_SIZE, MUSIC_PATH, MUSIC_SOURCE_URL, MUSIC_USER_AGENT,
    MusicRedirectHandler, MusicSource, RecordServer, validate_music_url,
)


ORIGIN = "https://lyn.lipopo.org"
MIRROR = "https://gaonan.github.io"
CDN = "https://f.video.weibocdn.com/fixed-stage.mp4?signed=public"


class VideoResponse(BytesIO):
    def __init__(self, data=b"video-data", status=200, url=CDN, content_range=None, content_type="video/mp4"):
        super().__init__(data)
        self.status = status
        self.url = url
        self.read_sizes = []
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.headers["Content-Length"] = str(len(data))
        if content_range:
            self.headers["Content-Range"] = content_range

    def geturl(self):
        return self.url

    def read(self, size=-1):
        self.read_sizes.append(size)
        if size < 0 or size > MUSIC_CHUNK_SIZE:
            raise AssertionError("Unbounded upstream read")
        return super().read(size)


class Opener:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        value = self.responses.pop(0)
        if isinstance(value, Exception):
            raise value
        return value


@contextmanager
def running_server(opener):
    with TemporaryDirectory() as tmp:
        with RecordServer(("127.0.0.1", 0), Path(tmp) / "records.sqlite3") as server:
            server.music_source = MusicSource(opener)
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                yield server, f"http://127.0.0.1:{server.server_port}"
            finally:
                server.shutdown()
                thread.join()


def fetch(url, method="GET", origin=ORIGIN, byte_range=None):
    headers = {"Origin": origin}
    if byte_range is not None:
        headers["Range"] = byte_range
    try:
        return urlopen(Request(url, headers=headers, method=method), timeout=5)
    except HTTPError as error:
        return error


class MusicSourceTests(unittest.TestCase):
    def test_stream_is_bounded_and_uses_only_the_fixed_source(self):
        data = b"a" * (MUSIC_CHUNK_SIZE * 2 + 37)
        upstream = VideoResponse(data)
        opener = Opener(upstream)
        with running_server(opener) as (server, base):
            with fetch(base + MUSIC_PATH, origin=MIRROR) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["Content-Type"], "video/mp4")
                self.assertEqual(response.headers["Content-Length"], str(len(data)))
                self.assertEqual(response.headers["Access-Control-Allow-Origin"], MIRROR)
                self.assertEqual(response.headers["Accept-Ranges"], "bytes")
                self.assertEqual(response.read(), data)
            self.assertTrue(upstream.closed)
            self.assertEqual(upstream.read_sizes, [MUSIC_CHUNK_SIZE, MUSIC_CHUNK_SIZE, 37])
            request, timeout = opener.requests[0]
            self.assertEqual(request.full_url, MUSIC_SOURCE_URL)
            self.assertEqual(request.get_header("User-agent"), MUSIC_USER_AGENT)
            self.assertEqual(timeout, 10)
            self.assertEqual(server.music_source.cached_url, CDN)

    def test_range_is_forwarded_and_head_consumes_no_body(self):
        get = VideoResponse(b"abc", 206, content_range="bytes 7-9/100")
        head = VideoResponse(b"abc", 206, content_range="bytes 97-99/100")
        opener = Opener(get, head)
        with running_server(opener) as (_, base):
            with fetch(base + MUSIC_PATH, byte_range="bytes=7-9") as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.headers["Content-Range"], "bytes 7-9/100")
                self.assertEqual(response.read(), b"abc")
            with fetch(base + MUSIC_PATH, method="HEAD", byte_range="bytes=-3") as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.headers["Content-Length"], "3")
                self.assertEqual(response.read(), b"")
            self.assertEqual(head.read_sizes, [])
            self.assertTrue(head.closed)
            self.assertEqual(opener.requests[0][0].get_header("Range"), "bytes=7-9")
            self.assertEqual(opener.requests[1][0].get_header("Range"), "bytes=-3")
            self.assertEqual(opener.requests[1][0].get_method(), "GET")
            self.assertEqual(opener.requests[1][0].full_url, CDN)
        redirected = MusicRedirectHandler().redirect_request(Request(MUSIC_SOURCE_URL, method="HEAD"),
                                                            None, 302, "Found", Message(), CDN)
        self.assertEqual(redirected.get_method(), "HEAD")

    def test_head_without_range_reports_complete_length_without_reading_video(self):
        upstream = VideoResponse(b"a", 206, content_range="bytes 0-0/123456")
        opener = Opener(upstream)
        with running_server(opener) as (_, base):
            with fetch(base + MUSIC_PATH, method="HEAD") as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["Content-Length"], "123456")
                self.assertIsNone(response.headers.get("Content-Range"))
                self.assertEqual(response.read(), b"")
            self.assertEqual(upstream.read_sizes, [])
            self.assertTrue(upstream.closed)
            self.assertEqual(opener.requests[0][0].get_header("Range"), "bytes=0-0")

    def test_invalid_ranges_queries_methods_and_origins_do_not_contact_upstream(self):
        opener = Opener()
        with running_server(opener) as (_, base):
            for value in ["bytes=", "bytes=-0", "bytes=9-1", "bytes=0-1,5-6", "items=0-1", "bytes=" + "9" * 30 + "-"]:
                with fetch(base + MUSIC_PATH, byte_range=value) as response:
                    self.assertEqual(response.status, 400, value)
            for suffix, method, origin, expected in [
                ("?url=https://example.org", "GET", ORIGIN, 400),
                ("", "POST", ORIGIN, 405), ("", "GET", "https://example.org", 403),
                ("", "OPTIONS", MIRROR, 204),
            ]:
                with fetch(base + MUSIC_PATH + suffix, method, origin) as response:
                    self.assertEqual(response.status, expected)
                    if method == "OPTIONS":
                        self.assertIn("Range", response.headers["Access-Control-Allow-Headers"])
                        self.assertNotIn("POST", response.headers["Access-Control-Allow-Methods"])
            self.assertEqual(opener.requests, [])

    def test_unsafe_redirect_and_html_response_are_rejected_and_closed(self):
        for url in ["http://f.video.weibocdn.com/a.mp4", "https://127.0.0.1/a", "https://evilweibocdn.com/a",
                    "https://f.video.weibocdn.com.evil.test/a", "https://user:pass@f.video.weibocdn.com/a",
                    "https://f.video.weibocdn.com:444/a"]:
            with self.assertRaises(ValueError, msg=url):
                validate_music_url(url)
            with self.assertRaises(ValueError, msg=url):
                MusicRedirectHandler().redirect_request(Request(MUSIC_SOURCE_URL), None, 302, "Found", Message(), url)
        for upstream in [VideoResponse(url="https://evil.test/a.mp4"), VideoResponse(content_type="text/html")]:
            source = MusicSource(Opener(upstream))
            with self.assertRaises(ValueError):
                source.open("GET", None)
            self.assertTrue(upstream.closed)
            self.assertIsNone(source.cached_url)

    def test_upstream_failure_does_not_affect_record_number_api(self):
        opener = Opener(URLError("temporarily unavailable"))
        with running_server(opener) as (server, base):
            with fetch(base + MUSIC_PATH) as response:
                self.assertEqual(response.status, 503)
                self.assertEqual(response.headers["Access-Control-Allow-Origin"], ORIGIN)
            self.assertIsNone(server.music_source.cached_url)
            with fetch(base + API_PATH) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), b'{"latest": null}')

    def test_cached_ranges_do_not_extend_the_signed_url_lifetime(self):
        clock = [100]
        opener = Opener(VideoResponse(), VideoResponse(), VideoResponse())
        source = MusicSource(opener)
        with patch("server.record_numbers.monotonic", lambda: clock[0]):
            source.open("GET", None).close()
            self.assertEqual(source.expires, 160)
            clock[0] = 130
            source.open("HEAD", None).close()
            self.assertEqual(opener.requests[-1][0].full_url, CDN)
            self.assertEqual(source.expires, 160)
            clock[0] = 161
            source.open("GET", None).close()
            self.assertEqual(opener.requests[-1][0].full_url, MUSIC_SOURCE_URL)
            self.assertEqual(source.expires, 221)

    def test_timeout_before_the_first_chunk_returns_503_and_closes_upstream(self):
        class SlowVideoResponse(VideoResponse):
            def read(self, size=-1):
                raise TimeoutError("upstream stalled")
        upstream = SlowVideoResponse()
        with running_server(Opener(upstream)) as (server, base):
            with fetch(base + MUSIC_PATH) as response:
                self.assertEqual(response.status, 503)
                self.assertEqual(response.headers["Content-Type"], "application/json; charset=utf-8")
            self.assertTrue(upstream.closed)
            self.assertIsNone(server.music_source.cached_url)

    def test_upstream_unsatisfiable_range_returns_416(self):
        headers = Message()
        headers["Content-Range"] = "bytes */100"
        upstream = HTTPError(CDN, 416, "Range not satisfiable", headers, BytesIO(b""))
        with running_server(Opener(upstream)) as (_, base):
            with fetch(base + MUSIC_PATH, byte_range="bytes=1000-") as response:
                self.assertEqual(response.status, 416)
                self.assertEqual(response.headers["Content-Range"], "bytes */100")


if __name__ == "__main__":
    unittest.main()
