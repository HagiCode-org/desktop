from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Iterable

from .runtime import CommandFailed
from .tasks import TARGET_HANDLERS, run_named_target


@dataclass
class ParsedArgs:
    target: str
    passthrough: list[str]


TARGET_ALIASES = {
    "setup": "Setup",
    "generateazureuploadplan": "GenerateAzureUploadPlan",
    "generateazureindex": "GenerateAzureIndex",
    "publishtoazureblob": "PublishToAzureBlob",
    "default": "Default",
}


def _normalize_target(raw: str | None) -> str:
    if not raw:
        return "Default"
    key = "".join(ch for ch in raw if ch.isalnum()).lower()
    mapped = TARGET_ALIASES.get(key)
    if not mapped:
        raise ValueError(f"unsupported target: {raw}")
    return mapped


def parse_build_args(args: Iterable[str]) -> ParsedArgs:
    tokens = list(args)
    target: str | None = None
    passthrough: list[str] = []

    i = 0
    while i < len(tokens):
        token = tokens[i]

        if token == "--":
            passthrough.extend(tokens[i + 1 :])
            break

        if token == "--target":
            if i + 1 >= len(tokens):
                raise ValueError("--target requires value")
            target = tokens[i + 1]
            i += 2
            continue

        if token.startswith("--target="):
            target = token.split("=", 1)[1]
            i += 1
            continue

        passthrough.append(token)
        i += 1

    return ParsedArgs(target=_normalize_target(target), passthrough=passthrough)


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]

    try:
        parsed = parse_build_args(args)
        print(f"[PYBUILD] target={parsed.target}")
        return run_named_target(parsed.target, parsed.passthrough)
    except CommandFailed as error:
        return error.exit_code
    except ValueError as error:
        print(f"[PYBUILD] {error}", file=sys.stderr)
        return 2
    except Exception as error:  # noqa: BLE001 - build entry maps any native failure to non-zero exit
        print(f"[PYBUILD] {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
