#!/usr/bin/env bash
set -euo pipefail

# ── Browser Organizer — Native Messaging Host Installer (macOS) ──────────────
#
# Usage:
#   ./install.sh                   # auto-detect extension ID from path
#   ./install.sh <extension-id>    # use a manually-supplied extension ID
#
# What this does:
#   1. Makes sync_host.py executable
#   2. Computes (or accepts) the Chrome extension ID
#   3. Writes a Native Messaging Host manifest so every Chrome profile
#      on this machine can talk to the sync host
#
# To uninstall, just delete the manifest:
#   rm "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.browser_organizer.sync.json"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SOURCE_SCRIPT="$SCRIPT_DIR/sync_host.py"
HOST_NAME="com.browser_organizer.sync"

# Chrome and Chromium-based browsers on macOS
CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_INSTALL_DIR="$HOME/Library/Application Support/Browser Organizer Native Host"
HOST_SCRIPT="$HOST_INSTALL_DIR/sync_host.py"
HOST_LAUNCHER="$HOST_INSTALL_DIR/run_sync_host.sh"

# ── Compute extension ID from the extension/ directory path ──────────────────
# Chrome derives unpacked-extension IDs by:
#   1. SHA-256 of the absolute path (UTF-8, lowercase on some platforms)
#   2. Take the first 32 hex characters
#   3. Map each hex digit:  0→a  1→b  …  9→j  a→k  b→l  c→m  d→n  e→o  f→p
compute_extension_id() {
  local ext_path="$1"
  local hex
  hex=$(printf '%s' "$ext_path" | shasum -a 256 | cut -c1-32)
  local id=""
  local i c
  for (( i=0; i<${#hex}; i++ )); do
    c="${hex:$i:1}"
    case "$c" in
      0) id+="a";; 1) id+="b";; 2) id+="c";; 3) id+="d";;
      4) id+="e";; 5) id+="f";; 6) id+="g";; 7) id+="h";;
      8) id+="i";; 9) id+="j";; a) id+="k";; b) id+="l";;
      c) id+="m";; d) id+="n";; e) id+="o";; f) id+="p";;
    esac
  done
  echo "$id"
}

EXT_DIR="$(cd "$SCRIPT_DIR/../extension" && pwd)"

if [[ $# -ge 1 ]]; then
  EXT_ID="$1"
  echo "Using supplied extension ID: $EXT_ID"
else
  EXT_ID=$(compute_extension_id "$EXT_DIR")
  echo "Auto-detected extension ID: $EXT_ID"
  echo "  (based on path: $EXT_DIR)"
  echo ""
  echo "  ⚠  If this doesn't match the ID shown at chrome://extensions,"
  echo "     re-run with the correct ID:  ./install.sh <real-id>"
fi

# ── Install the host outside Desktop/project folders ─────────────────────────
# macOS privacy controls can block Chrome-launched child processes from reading
# files under Desktop. Application Support is the right home for a local helper.
mkdir -p "$HOST_INSTALL_DIR"
cp "$HOST_SOURCE_SCRIPT" "$HOST_SCRIPT"

# ── Make a launcher with an absolute Python path ─────────────────────────────
# Chrome launched from the Dock does not inherit the shell PATH. A shell
# launcher avoids relying on "#!/usr/bin/env python3" inside the Python host.
PYTHON_BIN="$(command -v python3 || true)"
if [[ -z "$PYTHON_BIN" && -x /usr/bin/python3 ]]; then
  PYTHON_BIN="/usr/bin/python3"
fi
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Error: python3 was not found. Install Python 3, then rerun this script." >&2
  exit 1
fi

cat > "$HOST_LAUNCHER" <<EOF
#!/bin/sh
LOG_DIR="\${HOME}/.browser-organizer"
mkdir -p "\$LOG_DIR" 2>/dev/null
printf '%s pid=%s launcher start python=%s script=%s args=%s\n' "\$(date '+%Y-%m-%d %H:%M:%S')" "\$\$" "$PYTHON_BIN" "$HOST_SCRIPT" "\$*" >> "\$LOG_DIR/sync-launcher.log" 2>/dev/null
exec "$PYTHON_BIN" "$HOST_SCRIPT" "\$@"
STATUS="\$?"
printf '%s pid=%s launcher exec_failed status=%s\n' "\$(date '+%Y-%m-%d %H:%M:%S')" "\$\$" "\$STATUS" >> "\$LOG_DIR/sync-launcher.log" 2>/dev/null
exit "\$STATUS"
EOF

# ── Make host files executable ───────────────────────────────────────────────
chmod +x "$HOST_SCRIPT"
chmod +x "$HOST_LAUNCHER"

# ── Write manifest for Google Chrome ─────────────────────────────────────────
mkdir -p "$CHROME_MANIFEST_DIR"
MANIFEST_FILE="$CHROME_MANIFEST_DIR/$HOST_NAME.json"

cat > "$MANIFEST_FILE" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Browser Organizer — cross-profile sync on the same machine",
  "path": "$HOST_LAUNCHER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo ""
echo "✅  Native messaging host installed!"
echo ""
echo "  Host script : $HOST_SCRIPT"
echo "  Source      : $HOST_SOURCE_SCRIPT"
echo "  Launcher    : $HOST_LAUNCHER"
echo "  Python      : $PYTHON_BIN"
echo "  Manifest    : $MANIFEST_FILE"
echo "  Extension ID: $EXT_ID"
echo ""
echo "Next steps:"
echo "  1. Go to chrome://extensions in EACH Chrome profile"
echo "  2. Click the ↻ reload button on Browser Organizer"
echo "  3. Open a new tab — the console should say:"
echo "       [sync] Native host connected."
echo ""
echo "  To verify: open a new tab, press F12 → Console, look for '[sync]' lines."
