"""
Camera Agent — lightweight HTTP server (Flask) that manages a camera process
on each board.  Run this on Board A/B/C so Next.js can control processes
remotely via HTTP instead of local spawn().

Usage:
    python camera_agent.py               # port 5050 (default)
    AGENT_PORT=5051 python camera_agent.py

Endpoints:
    POST /start   { "script": "main.py", "args": {"cam_left": 0, "cam_right": 1} }
    POST /stop
    POST /restart { same body as /start }
    GET  /status  → { "running": bool, "pid": int|null }
    GET  /logs    → { "logs": [str, ...] }
"""

from flask import Flask, request, jsonify
import subprocess
import threading
import os
import sys
import time
import collections

app = Flask(__name__)
PORT = int(os.environ.get("AGENT_PORT", 5050))

proc: "subprocess.Popen | None" = None
proc_lock = threading.Lock()
logs: "collections.deque[str]" = collections.deque(maxlen=200)


def _ts() -> str:
    return time.strftime("%H:%M:%S")


def _push_log(line: str) -> None:
    logs.append(f"[{_ts()}] {line}")


def _stream(p: subprocess.Popen) -> None:
    """Drain stdout/stderr of a process into the log buffer."""
    def _read(stream, prefix=""):
        for raw in stream:
            line = raw.rstrip()
            if line:
                _push_log(f"{prefix}{line}")

    t_out = threading.Thread(target=_read, args=(p.stdout,),        daemon=True)
    t_err = threading.Thread(target=_read, args=(p.stderr, "[ERR] "), daemon=True)
    t_out.start()
    t_err.start()


def _build_args(args_dict: dict) -> list:
    result = []
    for k, v in args_dict.items():
        result += [f"--{k.replace('_', '-')}", str(v)]
    return result


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/start", methods=["POST"])
def start():
    global proc
    data = request.get_json(force=True, silent=True) or {}
    script = data.get("script", "main.py")
    extra_args = _build_args(data.get("args", {}))

    with proc_lock:
        if proc is not None and proc.poll() is None:
            return jsonify({"ok": True, "already_running": True, "pid": proc.pid})

        cmd = [sys.executable, script] + extra_args
        _push_log(f"▶ Starting: {' '.join(cmd)}")
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=os.path.dirname(os.path.abspath(script)) or ".",
            )
        except Exception as exc:
            _push_log(f"✗ Failed to start: {exc}")
            return jsonify({"ok": False, "error": str(exc)}), 500

        _stream(proc)

    return jsonify({"ok": True, "pid": proc.pid})


@app.route("/stop", methods=["POST"])
def stop():
    global proc
    with proc_lock:
        if proc is None or proc.poll() is not None:
            return jsonify({"ok": False, "error": "Not running"})
        proc.terminate()
        _push_log("⏹ Stopped by agent request")
        proc = None
    return jsonify({"ok": True})


@app.route("/restart", methods=["POST"])
def restart():
    # Stop first, then start
    global proc
    with proc_lock:
        if proc is not None and proc.poll() is None:
            proc.terminate()
            _push_log("↺ Restarting…")
            proc = None

    time.sleep(0.5)

    # Delegate to start() logic
    return start()


@app.route("/status", methods=["GET"])
def status():
    with proc_lock:
        running = proc is not None and proc.poll() is None
        pid = proc.pid if running else None
    return jsonify({"running": running, "pid": pid})


@app.route("/logs", methods=["GET"])
def get_logs():
    return jsonify({"logs": list(logs)})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "port": PORT})


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Camera Agent listening on 0.0.0.0:{PORT}")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
