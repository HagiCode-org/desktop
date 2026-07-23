from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .params import BuildParams


def default_plan_path(repo_root: Path) -> Path:
    return repo_root / "artifacts" / "azure-upload-plan.json"


def default_matrix_path(repo_root: Path) -> Path:
    return repo_root / "artifacts" / "azure-upload-matrix.json"


def default_index_path(repo_root: Path) -> Path:
    return repo_root / "artifacts" / "azure-index.json"


def resolve_plan_output_path(repo_root: Path, params: BuildParams) -> Path:
    if params.azure_upload_plan_output_path.strip():
        return Path(params.azure_upload_plan_output_path)
    return default_plan_path(repo_root)


def resolve_matrix_output_path(repo_root: Path, params: BuildParams) -> Path:
    if params.azure_upload_matrix_output_path.strip():
        return Path(params.azure_upload_matrix_output_path)
    return default_matrix_path(repo_root)


def resolve_index_output_path(repo_root: Path, params: BuildParams) -> Path:
    if params.azure_index_output_path.strip():
        return Path(params.azure_index_output_path)
    return default_index_path(repo_root)


def write_json(path: Path | str, value: Any, *, indent: int | None = 2) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, indent=indent, ensure_ascii=False)
    if indent is not None:
        text += "\n"
    target.write_text(text, encoding="utf-8")


def read_json(path: Path | str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def camelize_key(key: str) -> str:
    if not key or "_" not in key:
        # already camel or single word: keep as-is if lower start, else lower first
        if key and key[0].isupper():
            return key[0].lower() + key[1:]
        return key
    parts = key.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:] if part)


def to_camel(value: Any) -> Any:
    if isinstance(value, list):
        return [to_camel(item) for item in value]
    if isinstance(value, dict):
        return {camelize_key(str(k)): to_camel(v) for k, v in value.items()}
    return value


def write_camel_json(path: Path | str, value: Any, *, minify: bool = False) -> str:
    payload = to_camel(value)
    indent = None if minify else 2
    text = json.dumps(payload, indent=indent, ensure_ascii=False, separators=(",", ":") if minify else None)
    if not minify:
        text += "\n"
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    return text
