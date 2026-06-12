#!/usr/bin/env python3
"""Static development server for the Warehouse Layout Editor.

The browser app uses ES modules and fetch(), so it must be served over HTTP
rather than opened from a file:// URL. This always serves the ``app/`` folder as
the web root, no matter which directory you launch it from, so the relative
fetch of ``data/default_layout.json`` resolves correctly.

    python -m server.dev_server          # serves http://localhost:8000
    python -m server.dev_server 9000     # custom port

Any static server pointed at ``app/`` works too, e.g. ``cd app && npx http-server``.
"""

from __future__ import annotations

import http.server
import socketserver
import sys
import threading
import webbrowser
from functools import partial

from server import APP_DIR


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".html": "text/html",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        # No caching in dev so edits to default_layout.json show on reload.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # quieter, single-line logs
        sys.stderr.write(f"{self.address_string()} - {fmt % args}\n")


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    port = int(argv[0]) if argv else 8000

    if not (APP_DIR / "index.html").exists():
        sys.stderr.write(f"error: {APP_DIR / 'index.html'} not found\n")
        return 1

    handler = partial(Handler, directory=str(APP_DIR))
    start_port = port
    for candidate in range(start_port, start_port + 10):
        try:
            httpd = socketserver.TCPServer(("", candidate), handler)
            port = candidate
            break
        except OSError:
            continue
    else:
        end_port = start_port + 9
        sys.stderr.write(f"error: could not bind to any port in range {start_port}-{end_port}\n")
        return 1
    url = f"http://localhost:{port}"
    with httpd:
        print(f"Warehouse Layout Editor  ->  {url}")
        print(f"Serving {APP_DIR}")
        print("Press Ctrl+C to stop.")
        chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        threading.Timer(0.5, lambda: webbrowser.get(f'"{chrome}" %s').open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
