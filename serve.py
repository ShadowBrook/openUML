#!/usr/bin/env python3
"""Static file server with Cache-Control: no-store plus an /ai-proxy relay
that forwards AI API calls to their real hosts (browsers block cross-origin
calls to providers that do not send CORS headers)."""
import http.server
import socketserver
import sys
import urllib.error
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642

FORWARD_HEADERS = ("Authorization", "Content-Type", "Accept", "X-Model")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # ---- CORS for the local proxy endpoint itself ----
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Target-URL, Authorization")

    def do_OPTIONS(self):
        if self.path == "/ai-proxy":
            self.send_response(204)
            self._cors()
            self.end_headers()
        else:
            self.send_response(204)
            self._cors()
            self.end_headers()

    def do_POST(self):
        if self.path != "/ai-proxy":
            self.send_error(404, "not found (POST is only handled by /ai-proxy)")
            return
        target = self.headers.get("X-Target-URL")
        if not target or not target.startswith("http"):
            self.send_error(400, "missing X-Target-URL")
            return
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(target, data=body, method="POST")
        for name in FORWARD_HEADERS:
            if self.headers.get(name):
                req.add_header(name, self.headers[name])
        try:
            up = urllib.request.urlopen(req, timeout=300)
        except urllib.error.HTTPError as e:
            # relay provider-level errors (401/402/429/5xx) with their body
            payload = e.read()
            self.send_response(e.code)
            self._cors()
            self.send_header("Content-Type", e.headers.get("Content-Type") or "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        except Exception as e:  # DNS/refused/timeout …
            payload = ('{"error": {"message": "proxy upstream failed: ' +
                       str(e).replace('"', "'") + '"}}').encode()
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        with up:
            self.send_response(up.status)
            self._cors()
            self.send_header("Content-Type", up.headers.get("Content-Type") or "application/json")
            self.end_headers()
            # stream through (SSE from upstream keeps flowing line by line)
            while True:
                chunk = up.read(1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()


class ReuseTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


with ReuseTCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"serving on {PORT}", flush=True)
    httpd.serve_forever()
