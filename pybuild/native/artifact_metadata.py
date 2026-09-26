from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .path_utils import build_blob_path, build_blob_url, normalize_version_prefix

KIND_OFFICIAL = "official"
KIND_GITHUB_RELEASE = "github-release"
DIGEST_THRESHOLD_BYTES = 100 * 1024 * 1024


@dataclass
class ArtifactDiagnostic:
    artifact_name: str
    code: str
    message: str
    stage: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "artifactName": self.artifact_name,
            "code": self.code,
            "message": self.message,
        }
        if self.stage is not None:
            payload["stage"] = self.stage
        return payload


@dataclass
class PublishedArtifact:
    name: str
    local_file_path: str
    path: str
    size: int
    last_modified: str
    direct_url: str
    sha256: str | None = None
    download_sources: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "localFilePath": self.local_file_path,
            "path": self.path,
            "size": self.size,
            "lastModified": self.last_modified,
            "directUrl": self.direct_url,
            "sha256": self.sha256,
            "downloadSources": [
                {key: value for key, value in source.items() if key != "webSeed"}
                for source in self.download_sources
            ],
        }


@dataclass
class MetadataBuildResult:
    artifacts: list[PublishedArtifact] = field(default_factory=list)
    diagnostics: list[ArtifactDiagnostic] = field(default_factory=list)


def _compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest().lower()


def _normalize_tag_name(version_prefix: str) -> str:
    value = version_prefix.strip()
    if value.startswith(("v", "V")):
        return f"v{value[1:]}"
    return f"v{value}"


def _create_download_sources(
    direct_url: str,
    file_name: str,
    version_prefix: str,
    repository: str | None,
) -> list[dict[str, Any]]:
    sources = [
        {
            "kind": KIND_OFFICIAL,
            "label": "Official",
            "url": direct_url,
            "primary": True,
        }
    ]
    if repository:
        encoded = quote(file_name, safe="")
        tag_name = _normalize_tag_name(version_prefix)
        sources.append(
            {
                "kind": KIND_GITHUB_RELEASE,
                "label": "GitHub Release",
                "url": f"https://github.com/{repository}/releases/download/{tag_name}/{encoded}",
                "primary": False,
            }
        )
    return sources


def build_artifact_metadata(
    file_paths: list[str],
    version_prefix: str,
    container_base_url: str,
    github_repository: str | None = None,
) -> MetadataBuildResult:
    result = MetadataBuildResult()
    normalized_prefix = normalize_version_prefix(version_prefix)
    normalized_repository = (github_repository or "").strip().strip("/") or None

    for file_path in sorted(
        (path for path in file_paths if not path.lower().endswith(".torrent")),
        key=str.lower,
    ):
        path = Path(file_path)
        if not path.is_file():
            result.diagnostics.append(
                ArtifactDiagnostic(
                    artifact_name=path.name,
                    code="source-missing",
                    message=f"源产物不存在：{file_path}",
                    stage="MetadataBuild",
                )
            )
            continue

        stat = path.stat()
        blob_path = build_blob_path(normalized_prefix, path.name)
        direct_url = build_blob_url(container_base_url, blob_path)
        last_modified = datetime.fromtimestamp(
            stat.st_mtime, tz=timezone.utc
        ).isoformat().replace("+00:00", "Z")
        artifact = PublishedArtifact(
            name=path.name,
            local_file_path=str(path.resolve()),
            path=blob_path,
            size=stat.st_size,
            last_modified=last_modified,
            direct_url=direct_url,
            download_sources=_create_download_sources(
                direct_url,
                path.name,
                normalized_prefix or version_prefix,
                normalized_repository,
            ),
        )
        if artifact.size >= DIGEST_THRESHOLD_BYTES:
            try:
                artifact.sha256 = _compute_sha256(path)
            except OSError as error:
                result.diagnostics.append(
                    ArtifactDiagnostic(
                        artifact_name=artifact.name,
                        code="missing-hash",
                        message=f"无法计算 sha256：{error}",
                        stage="MetadataBuild",
                    )
                )
        result.artifacts.append(artifact)

    return result
