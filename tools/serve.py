"""Local dev server with browser caching turned off, so edits always show up.
Run: python3 tools/serve.py [port]"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ThreadingHTTPServer(("", port), NoCache).serve_forever()
