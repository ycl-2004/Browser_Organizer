#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTENSION_DIR="$PROJECT_DIR/extension"
OUTPUT_DIR="${1:-$PROJECT_DIR/dist}"

if [[ "$OUTPUT_DIR" != /* ]]; then
  OUTPUT_DIR="$PROJECT_DIR/$OUTPUT_DIR"
fi

if [[ ! -f "$EXTENSION_DIR/manifest.json" ]]; then
  echo "Error: extension/manifest.json was not found." >&2
  exit 1
fi

VERSION="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$EXTENSION_DIR/manifest.json" | head -n 1)"
if [[ -z "$VERSION" ]]; then
  echo "Error: could not read the extension version from manifest.json." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required to package the extension." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
OUTPUT_PATH="$OUTPUT_DIR/Browser-Organizer-v$VERSION.zip"
rm -f "$OUTPUT_PATH"

(
  cd "$EXTENSION_DIR"
  zip -qr "$OUTPUT_PATH" . -x '*.DS_Store' '*/.DS_Store' 'config.local.js'
)

echo "Created: $OUTPUT_PATH"
echo "Version: $VERSION"
echo "Contents: extension files at the ZIP root"
