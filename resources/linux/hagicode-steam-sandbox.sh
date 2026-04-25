#!/usr/bin/env bash

set -euo pipefail

DOCS_URL="${HAGICODE_STEAM_SANDBOX_DOCS_URL:-https://docs.hagicode.com}"

if command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$DOCS_URL"
fi

if command -v gio >/dev/null 2>&1; then
  exec gio open "$DOCS_URL"
fi

echo "Unable to open a browser automatically. Visit: $DOCS_URL" >&2
exit 1
