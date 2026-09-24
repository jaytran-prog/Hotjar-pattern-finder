#!/usr/bin/env python3
"""Localhost-only receiver that saves Chrome screenshots to disk.

Why: the Chrome extension's screenshots live inside the browser and can't be
written to disk directly (no save path, and macOS screen capture needs a
permission the session doesn't have). `upload_image` *can* push a screenshot
into a file <input>, so this serves a page with one; picking a file POSTs it
back here and it's written to OUT_DIR. Binds to 127.0.0.1 only, so recordings
(which contain PII) never leave the machine.

Usage: python3 shot_receiver.py <out_dir> [port]   (default port 8765)
Then open http://127.0.0.1:<port>/ in a Chrome tab and upload_image to #shot.
"""
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

OUT_DIR = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "shots")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
os.makedirs(OUT_DIR, exist_ok=True)

PAGE = b"""<!doctype html><meta charset="utf-8"><title>Shot receiver</title>
<body style="font:14px system-ui;padding:16px">
<h3>Hotjar shot receiver</h3>
<input type="file" id="shot" accept="image/*">
<ol id="log"></ol>
<script>
document.getElementById('shot').addEventListener('change', async (e) => {
  for (const f of e.target.files) {
    const r = await fetch('/save?name=' + encodeURIComponent(f.name), {method: 'POST', body: f});
    const li = document.createElement('li');
    li.textContent = (r.ok ? 'saved ' : 'FAILED ') + f.name + ' (' + f.size + ' bytes)';
    document.getElementById('log').appendChild(li);
  }
  e.target.value = '';
});
</script></body>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(PAGE)

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = os.path.basename(q.get("name", ["shot.png"])[0])
        name = re.sub(r"[^A-Za-z0-9._-]", "_", name) or "shot.png"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(os.path.join(OUT_DIR, name), "wb") as fh:
            fh.write(body)
        print(f"saved {name} ({len(body)} bytes)", flush=True)
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"receiver on http://127.0.0.1:{PORT}/ -> {OUT_DIR}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
