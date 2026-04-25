#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Steam injects its overlay through LD_PRELOAD. Clearing it avoids early
# Chromium/Electron zygote crashes when launching unpacked Linux artifacts.
unset LD_PRELOAD

exec "$SCRIPT_DIR/hagicode-desktop" --disable-setuid-sandbox --no-sandbox "$@"
