#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Steam can wrap native Linux builds in pressure-vessel. Electron's GTK,
# GSettings, and GPU stack are more reliable from the host desktop session, so
# hand the real app back to Steam's host launcher before Chromium starts.
if [[ "${HAGICODE_STEAM_HOST_REEXEC:-}" != "1" ]] \
  && [[ "${container:-}" == "pressure-vessel" \
    || -n "${PRESSURE_VESSEL_RUNTIME:-}" \
    || -n "${PRESSURE_VESSEL_RUNTIME_BASE:-}" \
    || -n "${PRESSURE_VESSEL_VARIABLE_DIR:-}" \
    || -n "${PRESSURE_VESSEL_APP_ID:-}" ]]; then
  if command -v steam-runtime-launch-client >/dev/null 2>&1; then
    echo "[HagicodeSteamWrapper] pressure-vessel detected; relaunching on host" >&2
    exec steam-runtime-launch-client \
      --host \
      --directory="$SCRIPT_DIR" \
      -- \
      /usr/bin/env \
      HAGICODE_STEAM_HOST_REEXEC=1 \
      HAGICODE_STEAM_LINUX=1 \
      "$SCRIPT_DIR/hagicode-desktop" \
      "$@"
  fi

  echo "[HagicodeSteamWrapper] pressure-vessel detected but steam-runtime-launch-client is unavailable; continuing in container" >&2
fi

# Steam injects its overlay through LD_PRELOAD. Clearing it avoids early
# Chromium/Electron zygote crashes when launching unpacked Linux artifacts.
unset LD_PRELOAD

# Steam Runtime can also prepend GTK/GIO/GSettings paths from its container.
# Electron is more stable when it resolves those desktop libraries and schemas
# from the host Fedora/KDE session instead of the older Steam Runtime bundle.
unset LD_LIBRARY_PATH
unset GIO_EXTRA_MODULES
unset GSETTINGS_SCHEMA_DIR
unset GTK_DATA_PREFIX
unset GTK_EXE_PREFIX
unset GTK_PATH

export HAGICODE_STEAM_LINUX=1

exec "$SCRIPT_DIR/hagicode-desktop" "$@"
