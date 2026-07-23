from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .path_utils import build_blob_path, build_blob_url, normalize_version_prefix
from .torrent import generate_torrent_sidecar

THRESHOLD_BYTES = 100 * 1024 * 1024

KIND_OFFICIAL = "official"
KIND_GITHUB_RELEASE = "github-release"


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
    torrent_sidecar_local_path: str | None = None
    torrent_path: str | None = None
    torrent_url: str | None = None
    info_hash: str | None = None
    sha256: str | None = None
    web_seeds: list[str] = field(default_factory=list)
    download_sources: list[dict[str, Any]] = field(default_factory=list)
    meets_threshold: bool = False
    hybrid_eligible: bool = False
    legacy_http_fallback: bool = True
    fallback_reason: str | None = "http-only-below-threshold"

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "localFilePath": self.local_file_path,
            "path": self.path,
            "size": self.size,
            "lastModified": self.last_modified,
            "directUrl": self.direct_url,
            "torrentSidecarLocalPath": self.torrent_sidecar_local_path,
            "torrentPath": self.torrent_path,
            "torrentUrl": self.torrent_url,
            "infoHash": self.info_hash,
            "sha256": self.sha256,
            "webSeeds": list(self.web_seeds),
            "downloadSources": list(self.download_sources),
            "meetsThreshold": self.meets_threshold,
            "hybridEligible": self.hybrid_eligible,
            "legacyHttpFallback": self.legacy_http_fallback,
            "fallbackReason": self.fallback_reason,
        }


@dataclass
class MetadataBuildResult:
    artifacts: list[PublishedArtifact] = field(default_factory=list)
    diagnostics: list[ArtifactDiagnostic] = field(default_factory=list)

    @property
    def eligible_artifact_count(self) -> int:
        return sum(1 for item in self.artifacts if item.meets_threshold)

    @property
    def sidecar_success_count(self) -> int:
        return sum(1 for item in self.artifacts if item.hybrid_eligible)

    @property
    def http_only_fallback_count(self) -> int:
        return sum(1 for item in self.artifacts if item.legacy_http_fallback)


def _compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest().lower()


def _normalize_tag_name(version_prefix: str) -> str:
    value = version_prefix.strip()
    if value.startswith(("v", "V")):
        return f"v{value[1:]}"
    return f"v{value}"


def _create_official_source(direct_url: str) -> dict[str, Any]:
    return {
        "kind": KIND_OFFICIAL,
        "label": "Official",
        "url": direct_url,
        "primary": True,
        "webSeed": True,
    }


def _create_github_source(file_name: str, version_prefix: str, repository: str | None) -> dict[str, Any] | None:
    if not repository:
        return None
    tag_name = _normalize_tag_name(version_prefix)
    encoded = quote(file_name, safe="")
    return {
        "kind": KIND_GITHUB_RELEASE,
        "label": "GitHub Release",
        "url": f"https://github.com/{repository}/releases/download/{tag_name}/{encoded}",
        "primary": False,
        "webSeed": True,
    }


def _add_download_source(artifact: PublishedArtifact, source: dict[str, Any]) -> None:
    artifact.download_sources.append(source)
    if source.get("webSeed") and source.get("url"):
        if source["url"] not in artifact.web_seeds:
            artifact.web_seeds.append(source["url"])


def _is_hybrid_complete(artifact: PublishedArtifact) -> bool:
    return bool(
        artifact.torrent_url
        and artifact.info_hash
        and artifact.sha256
        and artifact.web_seeds
    )


def build_hybrid_metadata(
    file_paths: list[str],
    version_prefix: str,
    container_base_url: str,
    github_repository: str | None = None,
    *,
    threshold_bytes: int = THRESHOLD_BYTES,
) -> MetadataBuildResult:
    result = MetadataBuildResult()
    normalized_prefix = normalize_version_prefix(version_prefix)
    normalized_repository = (github_repository or "").strip().strip("/") or None

    ordered = sorted(
        [path for path in file_paths if not path.lower().endswith(".torrent")],
        key=lambda item: item.lower(),
    )

    for file_path in ordered:
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
        from datetime import datetime, timezone

        last_modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        artifact = PublishedArtifact(
            name=path.name,
            local_file_path=str(path.resolve()),
            path=blob_path,
            size=stat.st_size,
            last_modified=last_modified,
            direct_url=direct_url,
            meets_threshold=stat.st_size >= threshold_bytes,
            hybrid_eligible=False,
            legacy_http_fallback=True,
            fallback_reason="http-only-below-threshold",
        )
        _add_download_source(artifact, _create_official_source(direct_url))
        github_source = _create_github_source(path.name, normalized_prefix or version_prefix, normalized_repository)
        if github_source:
            _add_download_source(artifact, github_source)
        else:
            result.diagnostics.append(
                ArtifactDiagnostic(
                    artifact_name=artifact.name,
                    code="github-release-mirror-omitted",
                    message="未能构建 GitHub Release 镜像下载源。",
                    stage="MetadataBuild",
                )
            )

        if not artifact.meets_threshold:
            result.artifacts.append(artifact)
            continue

        try:
            artifact.sha256 = _compute_sha256(path)
        except Exception as error:  # noqa: BLE001
            artifact.fallback_reason = "missing-hash"
            result.diagnostics.append(
                ArtifactDiagnostic(
                    artifact_name=artifact.name,
                    code="missing-hash",
                    message=f"无法计算 sha256：{error}",
                    stage="MetadataBuild",
                )
            )
            result.artifacts.append(artifact)
            continue

        sidecar_path = Path(f"{path}.torrent")
        torrent_blob_path = f"{artifact.path}.torrent"
        torrent_url = build_blob_url(container_base_url, torrent_blob_path)
        try:
            sidecar = generate_torrent_sidecar(
                source_path=path,
                sidecar_path=sidecar_path,
                display_name=path.name,
                web_seeds=artifact.web_seeds,
            )
            artifact.torrent_sidecar_local_path = sidecar.sidecar_path
            artifact.torrent_path = torrent_blob_path
            artifact.torrent_url = torrent_url
            artifact.info_hash = sidecar.info_hash
            artifact.hybrid_eligible = _is_hybrid_complete(artifact)
            artifact.legacy_http_fallback = not artifact.hybrid_eligible
            artifact.fallback_reason = None if artifact.hybrid_eligible else "incomplete-hybrid-metadata"
        except Exception as error:  # noqa: BLE001
            artifact.fallback_reason = "sidecar-generation-failed"
            result.diagnostics.append(
                ArtifactDiagnostic(
                    artifact_name=artifact.name,
                    code="sidecar-generation-failed",
                    message=f"生成 torrent sidecar 失败：{error}",
                    stage="SidecarGeneration",
                )
            )
            if sidecar_path.exists():
                try:
                    sidecar_path.unlink()
                except OSError:
                    pass

        result.artifacts.append(artifact)

    return result
