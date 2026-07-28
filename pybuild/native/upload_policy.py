from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_POLICY_PATH = Path(__file__).resolve().parents[2] / "config" / "release-artifact-upload-policy.json"


@dataclass(frozen=True)
class UploadPolicyDecision:
    file_name: str
    package_type: str
    signed: bool
    enabled: bool
    reason: str


def load_upload_policy(path: Path | str = DEFAULT_POLICY_PATH) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def resolve_upload_policy(file_name: str, policy: dict[str, Any] | None = None) -> UploadPolicyDecision:
    effective_policy = policy if policy is not None else load_upload_policy()
    lower_name = Path(file_name).name.lower()
    package_type = classify_package_type(lower_name)
    signed = is_signed_artifact_name(lower_name)
    packages = effective_policy.get("packages") or {}
    enabled = bool(packages.get(package_type, effective_policy.get("defaultEnabled", True)))
    reason = "enabled"

    if signed and effective_policy.get("disableSigned", True):
        enabled = False
        reason = "signed-disabled"
    elif not enabled:
        reason = f"{package_type}-disabled"

    return UploadPolicyDecision(
        file_name=Path(file_name).name,
        package_type=package_type,
        signed=signed,
        enabled=enabled,
        reason=reason,
    )


def filter_policy_enabled_files(file_paths: list[str], policy: dict[str, Any] | None = None) -> list[str]:
    return [path for path in file_paths if resolve_upload_policy(Path(path).name, policy).enabled]


def classify_package_type(file_name: str) -> str:
    lower_name = Path(file_name).name.lower()
    if lower_name.endswith(".zip"):
        if "win" in lower_name:
            return "windows-zip"
        if "linux" in lower_name:
            return "linux-zip"
        if "darwin" in lower_name or "mac" in lower_name or "osx" in lower_name:
            return "macos-arm64-zip" if "arm64" in lower_name or "aarch64" in lower_name else "macos-x64-zip"
        return "unknown-zip"
    if lower_name.endswith(".tar.gz"):
        return "linux-tar-gz" if "linux" in lower_name else "unknown-tar-gz"
    if lower_name.endswith(".appimage"):
        return "linux-appimage"
    if lower_name.endswith(".dmg"):
        return "macos-arm64-dmg" if "arm64" in lower_name or "aarch64" in lower_name else "macos-x64-dmg"
    if lower_name.endswith(".msix"):
        return "windows-msix"
    if lower_name.endswith(".exe"):
        return "windows-nsis" if "setup" in lower_name else "windows-portable"
    return "unknown"


def is_signed_artifact_name(file_name: str) -> bool:
    stem = Path(file_name).name.lower()
    return "signed" in stem and "unsigned" not in stem
