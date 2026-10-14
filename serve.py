#!/usr/bin/env python3
"""Serves ElecAD on http://localhost:8765 without browser caching (ES modules need http://)."""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'ElecAD: http://localhost:{port}')
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
