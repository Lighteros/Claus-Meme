#!/usr/bin/env python3
"""Serve the local Claus clone with clean URLs and journal path encoding."""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
SKIP = {"download_site.py", "download_arena.py", "serve.py", "homepage.html", "arena-src.html"}


class ClausHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        parsed = urlparse(path)
        raw = parsed.path
        if raw == "/onchain.json":
            tx = (parse_qs(parsed.query).get("tx") or [""])[0]
            if tx:
                candidate = ROOT / "onchain" / f"{tx}.json"
                if candidate.exists():
                    return str(candidate)
        for candidate in self._candidates(raw):
            if candidate.exists():
                if candidate.is_dir():
                    index = candidate / "index.html"
                    if index.exists():
                        return str(index)
                elif candidate.name not in SKIP:
                    return str(candidate)
        missing = ROOT / "404.html"
        return str(missing if missing.exists() else ROOT / "index.html")

    def _candidates(self, raw: str):
        path = raw.split("?", 1)[0]
        if not path or path == "/":
            yield ROOT / "index.html"
            return
        relative = path.lstrip("/")
        encoded = relative
        decoded = unquote(relative)
        for name in (encoded, decoded, encoded.replace(":", "%3A"), decoded.replace(":", "%3A")):
            yield ROOT / name
            yield ROOT / name / "index.html"

    def send_error(self, code, message=None, explain=None):
        if code == 404 and (ROOT / "404.html").exists():
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            body = (ROOT / "404.html").read_bytes()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), ClausHandler)
    print(f"Claus clone at http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    main()
