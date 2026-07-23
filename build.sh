#!/usr/bin/env bash

bash --version 2>&1 | head -n 1

set -eo pipefail
SCRIPT_DIR=$(cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)

function ResolvePython {
    if [[ -n "${PYTHON_EXE:-}" ]] && command -v "$PYTHON_EXE" &>/dev/null; then
        echo "$PYTHON_EXE"
        return
    fi

    if command -v python3 &>/dev/null; then
        echo "python3"
        return
    fi

    if command -v python &>/dev/null; then
        echo "python"
        return
    fi

    echo "ERROR: python executable not found. Install python3 or set PYTHON_EXE." >&2
    exit 2
}

PYTHON_CMD=$(ResolvePython)
export PYTHONPATH="$SCRIPT_DIR${PYTHONPATH:+:$PYTHONPATH}"

exec "$PYTHON_CMD" -m pybuild.entry "$@"
