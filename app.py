"""Local-only web interface; never sends ledger data to cloud services."""
from __future__ import annotations

import base64
import json
import os
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from je_core import analyze, import_data
from report import export_xlsx

HERE = Path(__file__).resolve().parent
STATE = {"last": None}
LOCK = threading.Lock()
MAX_REQUEST_BYTES = 30 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, data, content_type="application/json", attachment=None):
        if isinstance(data, (dict, list)):
            payload = json.dumps(data, default=str).encode("utf-8")
        elif isinstance(data, str):
            payload = data.encode("utf-8")
        else:
            payload = data
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self' 'unsafe-inline' data: blob:; connect-src 'self'; img-src 'self' data:")
        if attachment:
            self.send_header("Content-Disposition", f'attachment; filename="{attachment}"')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.respond(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/demo":
            self.respond(200, (HERE / "examples" / "synthetic_journal_entries.csv").read_bytes(), "text/csv; charset=utf-8")
        elif self.path == "/health":
            self.respond(200, {"status": "ok", "mode": "local-only"})
        else:
            self.respond(404, {"error": "Not found"})

    def do_POST(self):
        if self.path not in ("/api/analyze", "/api/export"):
            self.respond(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self.respond(413, {"error": "Upload exceeds the 30 MB request limit."})
                return
            payload = json.loads(self.rfile.read(length))
            if self.path == "/api/analyze":
                name = str(payload.get("filename", ""))
                file_bytes = base64.b64decode(payload["content_base64"], validate=True)
                raw = import_data(name, file_bytes)
                result = analyze(raw, payload.get("config", {}))
                with LOCK:
                    STATE["last"] = result
                # Send full result: browser UI displays only the first 250 registers.
                self.respond(200, result)
            else:
                with LOCK:
                    analysis = STATE["last"]
                if analysis is None:
                    self.respond(400, {"error": "Analyze a journal-entry file before exporting."})
                    return
                workbook = export_xlsx(analysis, payload.get("evidence", []))
                self.respond(200, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             "AuditJE_Journal_Entry_Workpaper.xlsx")
        except (ValueError, KeyError, TypeError, OverflowError) as exc:
            self.respond(400, {"error": str(exc)})
        except Exception as exc:
            # No local data in error response or server logs.
            self.respond(500, {"error": "Processing failed. Check file format and headers; see README."})

    def log_message(self, format, *args):
        return  # Avoid revealing uploaded file names or sensitive data in terminal history.


def main():
    port = int(os.environ.get("AUDITJE_PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"AuditJE started locally at {url} (press Ctrl+C to stop)", flush=True)
    threading.Timer(1, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAuditJE stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
