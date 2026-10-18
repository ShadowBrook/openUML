#!/usr/bin/env python3
"""Static file server with Cache-Control: no-store (dev helper)."""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ReuseTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


with ReuseTCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"serving on {PORT}", flush=True)
    httpd.serve_forever()
