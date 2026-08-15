#!/usr/bin/env python3
"""
Native messaging host for Browser Organizer cross-profile sync.

Manages a shared JSON file so multiple Chrome profiles on the same
machine stay in sync without manual Export / Import.

Protocol (one request → one response, then exit):
  { "action": "write", "data": { ... } }  →  { "ok": true, "syncedAt": <float> }
  { "action": "read" }                    →  { "ok": true, "data": { ... } | null }
  { "action": "check" }                   →  { "ok": true, "lastModified": <float> }
  { "action": "ping" }                    →  { "ok": true }
"""

import json
import os
import struct
import sys
import time

SYNC_DIR = os.path.expanduser("~/.browser-organizer")
SYNC_FILE = os.path.join(SYNC_DIR, "sync-data.json")
LOG_FILE = os.path.join(SYNC_DIR, "sync-host.log")

# Chrome caps native-messaging responses at 1 MB.
MAX_RESPONSE_BYTES = 1_000_000


def log(message):
    """Append debug info without touching stdout, which belongs to Chrome."""
    try:
        os.makedirs(SYNC_DIR, exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{timestamp} pid={os.getpid()} {message}\n")
    except Exception:
        pass


# ── stdio helpers (Chrome native-messaging wire format) ──────────────────────

def read_message():
    """Read a single length-prefixed JSON message from stdin."""
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        log(f"short_read bytes={len(raw)} argv={sys.argv[1:]}")
        return None
    length = struct.unpack("=I", raw)[0]
    data = sys.stdin.buffer.read(length)
    if len(data) != length:
        log(f"incomplete_body expected={length} actual={len(data)}")
        return None
    return json.loads(data.decode("utf-8"))


def send_message(obj):
    """Write a single length-prefixed JSON message to stdout."""
    encoded = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    if len(encoded) > MAX_RESPONSE_BYTES:
        encoded = json.dumps(
            {"ok": False, "error": "payload_too_large"}
        ).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


# ── action handlers ──────────────────────────────────────────────────────────

def handle_write(msg):
    os.makedirs(SYNC_DIR, exist_ok=True)
    data = msg.get("data", {})
    ts = time.time()
    data["_syncedAt"] = ts
    # Atomic write: tmp → rename
    tmp = SYNC_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, SYNC_FILE)
    send_message({"ok": True, "syncedAt": ts})


def handle_read():
    if not os.path.exists(SYNC_FILE):
        send_message({"ok": True, "data": None})
        return
    with open(SYNC_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    send_message({"ok": True, "data": data})


def handle_check():
    if os.path.exists(SYNC_FILE):
        send_message({"ok": True, "lastModified": os.path.getmtime(SYNC_FILE)})
    else:
        send_message({"ok": True, "lastModified": 0})


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    log(f"start argv={sys.argv[1:]}")
    msg = read_message()
    if not msg:
        log("exit no_message")
        return
    action = msg.get("action")
    log(f"action={action}")
    try:
        if action == "write":
            handle_write(msg)
        elif action == "read":
            handle_read()
        elif action == "check":
            handle_check()
        elif action == "ping":
            send_message({"ok": True})
        else:
            send_message({"ok": False, "error": "unknown_action"})
        log(f"sent action={action}")
    except Exception as exc:
        log(f"error action={action} error={exc!r}")
        send_message({"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
