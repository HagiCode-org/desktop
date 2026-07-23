from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .azure_blob import AzureBlobClient, AzureBlobPublishOptions, BlobInfo, list_blobs, validate_index_file
from .hybrid_metadata import KIND_OFFICIAL, PublishedArtifact
from .params import resolve_github_repository_name
from .path_utils import build_blob_url, extract_version, is_github_generated_source_archive, resolve_public_base_url


@dataclass
class IndexGenerationResult:
    index_json: str = ""
    document: dict[str, Any] | None = None
    version_count: int = 0
    asset_count: int = 0
    http_only_fallback_count: int = 0
    missing_published_artifact_paths: list[str] = field(default_factory=list)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)


def try_parse_version(version: str) -> tuple[int, ...] | None:
    if not version or not str(version).strip():
        return None
    normalized = str(version).strip().lstrip("vV")
    # strip build metadata
    normalized = normalized.split("+", 1)[0]
    main, _, pre = normalized.partition("-")
    parts = main.split(".")
    try:
        numbers = tuple(int(part) for part in parts[:3])
        while len(numbers) < 3:
            numbers = numbers + (0,)
    except ValueError:
        return None
    # prerelease lowers precedence vs stable with same numbers
    if pre:
        return numbers + (0, pre)
    return numbers + (1, "")


def compare_precedence(left: tuple, right: tuple) -> int:
    # Compare major.minor.patch first
    for index in range(3):
        if left[index] != right[index]:
            return 1 if left[index] > right[index] else -1
    # stable (1) > prerelease (0)
    if left[3] != right[3]:
        return 1 if left[3] > right[3] else -1
    if left[3] == 0:
        if left[4] == right[4]:
            return 0
        return 1 if left[4] > right[4] else -1
    return 0


def extract_channel_from_version(version: str) -> str:
    value = (version or "").strip().lstrip("vV")
    dash_index = value.find("-")
    if dash_index <= 0:
        return "stable"
    prerelease = value[dash_index + 1 :].lower()
    for name in ("beta", "canary", "alpha", "dev", "preview", "rc"):
        if prerelease.startswith(f"{name}.") or prerelease.startswith(name):
            if name == "rc":
                return "preview"
            return name
    return "preview"


def build_indexed_download_sources(metadata: PublishedArtifact | None, direct_url: str) -> list[dict[str, Any]]:
    if metadata is None:
        return []
    sources = metadata.download_sources or [
        {
            "kind": KIND_OFFICIAL,
            "label": "Official",
            "url": direct_url,
            "primary": True,
            "webSeed": True,
        }
    ]
    dedup: dict[str, dict[str, Any]] = {}
    for source in sources:
        url = source.get("url")
        if not url:
            continue
        key = f"{source.get('kind')}|{url}".lower()
        if key not in dedup:
            dedup[key] = source
    ordered = list(dedup.values())
    ordered.sort(key=lambda item: (0 if item.get("primary") else 1, str(item.get("kind") or "").lower()))
    return ordered


def build_indexed_web_seeds(
    metadata: PublishedArtifact | None,
    download_sources: list[dict[str, Any]],
    direct_url: str,
) -> list[str]:
    if metadata is None:
        return []
    seeds: list[str] = []
    for url in list(metadata.web_seeds) + [source["url"] for source in download_sources if source.get("webSeed")]:
        if url and url not in seeds:
            seeds.append(url)
    if not seeds:
        seeds.append(direct_url)
    return seeds


def build_index_result(
    blobs: list[BlobInfo],
    sas_url: str,
    published_artifacts: list[PublishedArtifact] | None = None,
    public_base_url: str = "",
    github_repository_name: str = "desktop",
) -> IndexGenerationResult:
    container_base_url = resolve_public_base_url(sas_url, public_base_url)
    metadata_by_path = {
        artifact.path: artifact for artifact in (published_artifacts or []) if artifact.path
    }

    version_map: dict[str, list[BlobInfo]] = {}
    for blob in blobs:
        version = extract_version(blob.name)
        version_map.setdefault(version, []).append(blob)

    version_list: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    total_assets = 0
    http_only_fallback_count = 0

    for version in sorted(version_map.keys(), key=str.lower, reverse=True):
        group = version_map[version]
        blobs_by_name = {blob.name: blob for blob in group}
        artifact_blobs = [
            blob
            for blob in group
            if not blob.name.lower().endswith(".torrent")
            and not is_github_generated_source_archive(Path(blob.name).name, github_repository_name, version)
        ]
        artifact_blobs.sort(key=lambda item: item.name.lower())

        indexed_assets: list[dict[str, Any]] = []
        file_projection: list[str] = []

        for blob in artifact_blobs:
            total_assets += 1
            file_projection.append(blob.name)
            metadata = metadata_by_path.get(blob.name)
            direct_url = metadata.direct_url if metadata and metadata.direct_url else build_blob_url(container_base_url, blob.name)
            last_modified = blob.last_modified.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            asset: dict[str, Any] = {
                "name": Path(blob.name).name,
                "path": blob.name,
                "size": blob.size,
                "lastModified": last_modified,
                "directUrl": direct_url,
            }
            sidecar_blob_name = f"{blob.name}.torrent"
            has_sidecar_blob = sidecar_blob_name in blobs_by_name
            can_publish_hybrid = bool(metadata and metadata.hybrid_eligible and has_sidecar_blob)
            indexed_download_sources = build_indexed_download_sources(metadata, direct_url)
            indexed_web_seeds = build_indexed_web_seeds(metadata, indexed_download_sources, direct_url)
            if indexed_download_sources:
                asset["downloadSources"] = indexed_download_sources
            if indexed_web_seeds:
                asset["webSeeds"] = indexed_web_seeds
            if can_publish_hybrid and metadata:
                asset["torrentUrl"] = metadata.torrent_url
                asset["infoHash"] = metadata.info_hash
                asset["sha256"] = metadata.sha256
            else:
                http_only_fallback_count += 1
                if has_sidecar_blob and not (metadata and metadata.hybrid_eligible):
                    diagnostics.append(
                        {
                            "artifactName": asset["name"],
                            "code": "historical-http-only" if metadata is None else "missing-hybrid-metadata",
                            "message": (
                                "发现 sidecar 但缺少发布期元数据，已保留 HTTP-only 兼容输出。"
                                if metadata is None
                                else "hybrid 元数据不完整，已保留 HTTP-only 兼容输出。"
                            ),
                            "stage": "MetadataBuild",
                        }
                    )
                elif not has_sidecar_blob and metadata and metadata.hybrid_eligible:
                    diagnostics.append(
                        {
                            "artifactName": asset["name"],
                            "code": "sidecar-missing-from-blob",
                            "message": "索引生成时未找到已声明的 torrent sidecar blob，已降级为 HTTP-only。",
                            "stage": "UploadMissing",
                        }
                    )
            indexed_assets.append(asset)

        version_list.append(
            {
                "version": version,
                "assets": indexed_assets,
                "files": file_projection,
            }
        )

    channels_data = build_channels_object(version_list)
    document = {
        "updatedAt": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "versions": version_list,
        "channels": channels_data,
    }
    result = IndexGenerationResult(
        document=document,
        version_count=len(version_list),
        asset_count=total_assets,
        http_only_fallback_count=http_only_fallback_count,
        diagnostics=diagnostics,
    )
    return result


def build_channels_object(versions: list[dict[str, Any]]) -> dict[str, Any]:
    channel_groups: dict[str, list[str]] = {}
    for version in versions:
        version_str = version["version"]
        channel = extract_channel_from_version(version_str)
        channel_groups.setdefault(channel, []).append(version_str)

    channels_data: dict[str, Any] = {}
    for channel_name, version_strings in channel_groups.items():
        latest_version = None
        latest_version_string = None
        for version_str in version_strings:
            parsed = try_parse_version(version_str)
            if parsed is None:
                continue
            if latest_version is None or compare_precedence(parsed, latest_version) > 0:
                latest_version = parsed
                latest_version_string = version_str
        if latest_version_string is None and version_strings:
            latest_version_string = version_strings[0]
        channels_data[channel_name] = {
            "latest": latest_version_string or "",
            "versions": version_strings,
        }
    return channels_data


def find_missing_published_artifact_paths(
    blobs: list[BlobInfo],
    published_artifacts: list[PublishedArtifact],
) -> list[str]:
    listed = {blob.name.lower() for blob in blobs}
    missing: list[str] = []
    for artifact in published_artifacts:
        if artifact.path and artifact.path.lower() not in listed:
            missing.append(artifact.path)
    return missing


def generate_index_from_blobs_with_metadata(
    options: AzureBlobPublishOptions,
    output_path: Path | str,
    published_artifacts: list[PublishedArtifact],
    *,
    minify: bool = False,
    github_repository: str = "HagiCode-org/desktop",
    client: AzureBlobClient | None = None,
    visibility_max_attempts: int = 6,
    visibility_retry_delay_seconds: float = 10.0,
) -> IndexGenerationResult:
    print("[PYBUILD] === Generating index.json from Azure blobs ===")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    blobs = list_blobs_until_visible(
        options,
        published_artifacts,
        client=client,
        max_attempts=visibility_max_attempts,
        retry_delay_seconds=visibility_retry_delay_seconds,
    )
    repo_name = resolve_github_repository_name(github_repository)
    result = build_index_result(
        blobs,
        options.sas_url,
        published_artifacts,
        options.public_base_url,
        github_repository_name=repo_name,
    )
    missing = find_missing_published_artifact_paths(blobs, published_artifacts)
    result.missing_published_artifact_paths = missing
    if missing:
        for path in missing:
            result.diagnostics.append(
                {
                    "artifactName": Path(path).name,
                    "code": "published-artifact-not-listed",
                    "message": f"本次发布的产物未出现在 Azure Blob 列表中，已阻止上传可能过期的 index.json：{path}",
                    "stage": "IndexWrite",
                }
            )
        print(f"[PYBUILD] Index generation blocked; missing published artifacts: {missing}")
        return result

    if result.document is None:
        return result

    indent = None if minify else 2
    separators = (",", ":") if minify else None
    index_json = json.dumps(result.document, indent=indent, ensure_ascii=False, separators=separators)
    if not minify:
        index_json += "\n"
    output.write_text(index_json, encoding="utf-8")
    result.index_json = index_json
    print(f"[PYBUILD] Wrote index.json -> {output} ({len(index_json)} bytes)")
    return result


def list_blobs_until_visible(
    options: AzureBlobPublishOptions,
    published_artifacts: list[PublishedArtifact],
    *,
    client: AzureBlobClient | None = None,
    max_attempts: int = 6,
    retry_delay_seconds: float = 10.0,
) -> list[BlobInfo]:
    if not published_artifacts:
        return list_blobs(options, client=client)

    required = {artifact.path for artifact in published_artifacts if artifact.path}
    blobs: list[BlobInfo] = []
    for attempt in range(1, max(1, max_attempts) + 1):
        blobs = list_blobs(options, client=client)
        listed = {blob.name for blob in blobs}
        missing = [path for path in required if path not in listed]
        if not missing:
            return blobs
        if attempt < max_attempts:
            print(
                f"[PYBUILD] waiting for published artifacts visibility "
                f"(attempt {attempt}/{max_attempts}, missing={len(missing)})"
            )
            time.sleep(retry_delay_seconds)
    return blobs


def run_generate_azure_index(repo_root: Path, params: Any) -> int:
    from .artifacts import resolve_index_output_path
    from .params import require_azure_sas
    from .publish import load_merged_publish_summary, report_index_diagnostics

    print("[PYBUILD] === Generate Azure Index ===")
    print(f"[PYBUILD] GitHub repository: {params.effective_github_repository}")
    sas = require_azure_sas(params)
    options = AzureBlobPublishOptions(
        sas_url=sas,
        public_base_url=params.azure_public_base_url,
        version_prefix="",
        local_index_path=str(resolve_index_output_path(repo_root, params)),
    )
    client = AzureBlobClient(sas)
    if not client.validate():
        raise ValueError("Azure Blob SAS URL 验证失败")

    output_path = resolve_index_output_path(repo_root, params)
    merged = load_merged_publish_summary(params)
    published = merged.published_artifacts if merged is not None else []

    print(f"[PYBUILD] minify: {params.minify_index_json}")
    index_result = generate_index_from_blobs_with_metadata(
        options,
        output_path,
        published,
        minify=params.minify_index_json,
        github_repository=params.effective_github_repository,
        client=client,
    )
    report_index_diagnostics(index_result)
    if not index_result.index_json:
        raise ValueError("生成 index.json 失败")
    if not validate_index_file(output_path):
        raise ValueError("index.json 验证失败")
    print("[PYBUILD] Azure index.json generated")
    print(f"[PYBUILD] path: {output_path}")
    print(f"[PYBUILD] size: {len(index_result.index_json)} bytes")
    return 0
