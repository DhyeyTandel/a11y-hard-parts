#!/usr/bin/env python3
"""
Static server for local development.

Plain `python3 -m http.server` sends no cache headers, so browsers apply
heuristic caching to the ES modules. Editing a component and reloading then
silently runs the *old* code — which, in a test suite, shows up as a failure
whose message does not match any assertion in the file you are looking at.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quiet: one line per module request is noise
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(NoCacheHandler, directory=".")
    print(f"http://localhost:{port}/  (demos)")
    print(f"http://localhost:{port}/test/run.html  (tests)")
    ThreadingHTTPServer(("", port), handler).serve_forever()
