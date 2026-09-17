"""Record every POST /build (payload + the hosted server's reply) while forwarding it to eud.scmjs.dev."""
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")
UP = "https://eud.scmjs.dev"
n = 0
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        global n
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        req = urllib.request.Request(UP + self.path, data=body, headers={"content-type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                status, reply = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, reply = e.code, e.read()
        n += 1
        with open(os.path.join(OUT, f"{n}-request.json"), "wb") as f: f.write(body)
        with open(os.path.join(OUT, f"{n}-reply.json"), "wb") as f: f.write(reply)
        sys.stderr.write(f"captured {n}: {status} {len(body)} -> {len(reply)}\n")
        self.send_response(status); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(reply))); self.end_headers(); self.wfile.write(reply)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8085), H).serve_forever()
