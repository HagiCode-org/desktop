from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .artifacts import read_json, resolve_index_output_path, write_camel_json
from .azure_blob import AzureBlobClient, AzureBlobPublishOptions, upload_artifacts, upload_index_json
from .azure_index import IndexGenerationResult, generate_index_from_blobs_with_metadata
from .github_release import GitHubReleaseClient
from .hybrid_metadata import PublishedArtifact, build_hybrid_metadata
from .params import (
    BuildParams,
    require_azure_sas,
    require_github_token,
    resolve_github_repository_name,
)
from .path_utils import is_github_generated_source_archive, resolve_public_base_url
from .upload_plan import resolve_effective_version, resolve_release_tag


@dataclass
class ReleasePublishSummary:
    shard_id: str = ""
    success: bool = False
    error_message: str = ""
    index_json: str = ""
    index_uploaded: bool = False
    eligible_asset_count: int = 0
    sidecar_success_count: int = 0
    http_only_fallback_count: int = 0
    uploaded_blob_count: int = 0
    skipped_blob_count: int = 0
    missing_blob_count: int = 0
    published_artifacts: list[PublishedArtifact] = field(default_factory=list)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)
    uploaded_blob_names: list[str] = field(default_factory=list)
    skipped_blob_names: list[str] = field(default_factory=list)
    missing_blob_names: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "shardId": self.shard_id,
            "success": self.success,
            "errorMessage": self.error_message,
            "indexJson": self.index_json,
            "indexUploaded": self.index_uploaded,
            "eligibleAssetCount": self.eligible_asset_count,
            "sidecarSuccessCount": self.sidecar_success_count,
            "httpOnlyFallbackCount": self.http_only_fallback_count,
            "uploadedBlobCount": self.uploaded_blob_count,
            "skippedBlobCount": self.skipped_blob_count,
            "missingBlobCount": self.missing_blob_count,
            "publishedArtifacts": [item.to_dict() for item in self.published_artifacts],
            "diagnostics": list(self.diagnostics),
            "uploadedBlobNames": list(self.uploaded_blob_names),
            "skippedBlobNames": list(self.skipped_blob_names),
            "missingBlobNames": list(self.missing_blob_names),
        }


def load_release_asset_selection_manifest(params: BuildParams) -> dict[str, Any] | None:
    path = params.release_assets_manifest.strip()
    if not path:
        return None
    manifest = read_json(path)
    if not manifest:
        raise ValueError(f"无法读取资产选择清单: {path}")
    assets = manifest.get("assets") or []
    if not assets:
        raise ValueError(f"资产选择清单为空: {path}")
    return manifest


def load_merged_publish_summary(params: BuildParams) -> ReleasePublishSummary | None:
    path = params.merged_publish_results_manifest.strip()
    if not path:
        return None
    manifest = read_json(path)
    if not manifest:
        raise ValueError(f"无法读取聚合结果清单: {path}")
    return merge_publish_results(manifest)


def merge_publish_results(manifest: dict[str, Any]) -> ReleasePublishSummary:
    expected_ids = sorted(
        {str(item) for item in (manifest.get("expectedShardIds") or []) if item},
        key=str.lower,
    )
    merged = ReleasePublishSummary(shard_id="finalize")
    seen_shard_ids: set[str] = set()
    seen_artifact_paths: set[str] = set()

    for result_file in manifest.get("resultFiles") or []:
        if not result_file:
            continue
        if not Path(result_file).is_file():
            raise ValueError(f"缺少 shard 发布结果文件: {result_file}")
        raw = read_json(result_file)
        if not isinstance(raw, dict):
            raise ValueError(f"shard 发布结果不是有效 JSON: {result_file}")
        shard_id = str(raw.get("shardId") or "")
        if not shard_id:
            raise ValueError(f"shard 发布结果缺少 shardId: {result_file}")
        if expected_ids and shard_id not in {item for item in expected_ids}:
            # case-insensitive check
            if not any(shard_id.lower() == item.lower() for item in expected_ids):
                raise ValueError(f"shard 发布结果与计划不匹配: {shard_id}")
        if not raw.get("success", False):
            raise ValueError(f"shard 发布失败，阻止根索引上传: {shard_id}")
        seen_shard_ids.add(shard_id.lower())
        merged.eligible_asset_count += int(raw.get("eligibleAssetCount") or 0)
        merged.sidecar_success_count += int(raw.get("sidecarSuccessCount") or 0)
        merged.http_only_fallback_count += int(raw.get("httpOnlyFallbackCount") or 0)
        merged.uploaded_blob_count += int(raw.get("uploadedBlobCount") or 0)
        merged.skipped_blob_count += int(raw.get("skippedBlobCount") or 0)
        merged.missing_blob_count += int(raw.get("missingBlobCount") or 0)
        merged.diagnostics.extend(raw.get("diagnostics") or [])
        merged.uploaded_blob_names.extend(raw.get("uploadedBlobNames") or [])
        merged.skipped_blob_names.extend(raw.get("skippedBlobNames") or [])
        merged.missing_blob_names.extend(raw.get("missingBlobNames") or [])
        for artifact_raw in raw.get("publishedArtifacts") or []:
            path = artifact_raw.get("path") or ""
            if path and path.lower() in seen_artifact_paths:
                continue
            if path:
                seen_artifact_paths.add(path.lower())
            merged.published_artifacts.append(_artifact_from_dict(artifact_raw))

    missing = [item for item in expected_ids if item.lower() not in seen_shard_ids]
    if missing:
        raise ValueError(f"缺少 shard 发布结果: {', '.join(missing)}")
    merged.success = True
    return merged


def _artifact_from_dict(raw: dict[str, Any]) -> PublishedArtifact:
    return PublishedArtifact(
        name=str(raw.get("name") or ""),
        local_file_path=str(raw.get("localFilePath") or ""),
        path=str(raw.get("path") or ""),
        size=int(raw.get("size") or 0),
        last_modified=str(raw.get("lastModified") or ""),
        direct_url=str(raw.get("directUrl") or ""),
        torrent_sidecar_local_path=raw.get("torrentSidecarLocalPath"),
        torrent_path=raw.get("torrentPath"),
        torrent_url=raw.get("torrentUrl"),
        info_hash=raw.get("infoHash"),
        sha256=raw.get("sha256"),
        web_seeds=list(raw.get("webSeeds") or []),
        download_sources=list(raw.get("downloadSources") or []),
        meets_threshold=bool(raw.get("meetsThreshold")),
        hybrid_eligible=bool(raw.get("hybridEligible")),
        legacy_http_fallback=bool(raw.get("legacyHttpFallback", True)),
        fallback_reason=raw.get("fallbackReason"),
    )


def export_publish_summary(params: BuildParams, summary: ReleasePublishSummary) -> None:
    path = params.publish_result_output_path.strip()
    if not path:
        return
    from .artifacts import write_json

    write_json(path, summary.to_dict(), indent=2)
    print(f"[PYBUILD] publish result exported: {path}")


def filter_eligible_files(
    file_paths: list[str],
    release_tag: str,
    effective_version: str,
    repository: str,
) -> list[str]:
    repo_name = resolve_github_repository_name(repository)
    filtered = [
        path
        for path in file_paths
        if not is_github_generated_source_archive(Path(path).name, repo_name, release_tag)
        and not is_github_generated_source_archive(Path(path).name, repo_name, effective_version)
    ]
    filtered.sort(key=lambda item: Path(item).name.lower())
    return filtered


def download_selected_release_assets(
    repo_root: Path,
    params: BuildParams,
    release_tag: str,
    effective_version: str,
    selection_manifest: dict[str, Any] | None,
) -> list[str]:
    token = require_github_token(params)
    client = GitHubReleaseClient(repo_root, token, params.effective_github_repository)
    shard_id = "serial"
    if selection_manifest and selection_manifest.get("shardId"):
        shard_id = str(selection_manifest["shardId"])
    download_directory = repo_root / "artifacts" / "release-assets" / shard_id
    if download_directory.exists():
        shutil.rmtree(download_directory)
    download_directory.mkdir(parents=True, exist_ok=True)

    selected_names = None
    if selection_manifest:
        selected_names = [
            str(asset.get("name"))
            for asset in (selection_manifest.get("assets") or [])
            if asset.get("name")
        ]
    print("[PYBUILD] === Download GitHub Release assets ===")
    print(f"[PYBUILD] Release Tag: {release_tag}")
    print(f"[PYBUILD] Download dir: {download_directory}")
    client.download_release_assets(release_tag, download_directory, selected_names)
    all_files = [str(path) for path in download_directory.iterdir() if path.is_file()]
    filtered = filter_eligible_files(
        all_files, release_tag, effective_version, params.effective_github_repository
    )
    skipped = len(all_files) - len(filtered)
    if skipped:
        print(f"[PYBUILD] filtered {skipped} GitHub source archive assets")
    print(f"[PYBUILD] prepared {len(filtered)} uploadable assets")
    return filtered


def orchestrate_publish(
    downloaded_files: list[str],
    options: AzureBlobPublishOptions,
    *,
    upload_index: bool,
    minify_index_json: bool,
    github_repository: str | None,
    client: AzureBlobClient | None = None,
) -> ReleasePublishSummary:
    summary = ReleasePublishSummary()
    container_base_url = resolve_public_base_url(options.sas_url, options.public_base_url)
    metadata_result = build_hybrid_metadata(
        downloaded_files,
        options.version_prefix,
        container_base_url,
        github_repository,
    )
    summary.eligible_asset_count = metadata_result.eligible_artifact_count
    summary.sidecar_success_count = metadata_result.sidecar_success_count
    summary.http_only_fallback_count = metadata_result.http_only_fallback_count
    summary.diagnostics.extend(item.to_dict() for item in metadata_result.diagnostics)
    summary.published_artifacts.extend(metadata_result.artifacts)

    files_to_upload = list(downloaded_files)
    for artifact in metadata_result.artifacts:
        if artifact.torrent_sidecar_local_path:
            files_to_upload.append(artifact.torrent_sidecar_local_path)
    # unique case-insensitive
    seen: set[str] = set()
    unique_files: list[str] = []
    for path in files_to_upload:
        key = path.lower()
        if key in seen:
            continue
        seen.add(key)
        unique_files.append(path)

    upload_result = upload_artifacts(unique_files, options, client=client)
    summary.uploaded_blob_count = len(upload_result.uploaded_blob_names)
    summary.skipped_blob_count = len(upload_result.skipped_blob_names)
    summary.missing_blob_count = len(upload_result.missing_blob_names)
    summary.uploaded_blob_names.extend(upload_result.uploaded_blob_names)
    summary.skipped_blob_names.extend(upload_result.skipped_blob_names)
    summary.missing_blob_names.extend(upload_result.missing_blob_names)

    for failed in upload_result.failed_blob_names:
        summary.diagnostics.append(
            {
                "artifactName": Path(failed).name,
                "code": "upload-failed",
                "message": f"Azure Blob 上传失败：{failed}",
                "stage": "UploadMissing",
            }
        )

    if not upload_result.success:
        if upload_result.errors:
            summary.error_message = f"Azure Blob 产物上传失败: {'; '.join(upload_result.errors)}"
        else:
            summary.error_message = f"Azure Blob 产物上传失败: {upload_result.error_message}"
        return summary

    uploaded_names = {name.lower() for name in upload_result.uploaded_blob_names + upload_result.skipped_blob_names}
    for artifact in summary.published_artifacts:
        if artifact.hybrid_eligible and artifact.torrent_path:
            if artifact.torrent_path.lower() not in uploaded_names:
                artifact.hybrid_eligible = False
                artifact.legacy_http_fallback = True
                artifact.fallback_reason = "sidecar-upload-missing"
                summary.diagnostics.append(
                    {
                        "artifactName": artifact.name,
                        "code": "sidecar-upload-missing",
                        "message": "torrent sidecar 未成功上传到 Azure Blob，已降级为 HTTP-only。",
                        "stage": "UploadMissing",
                    }
                )

    summary.sidecar_success_count = sum(1 for item in summary.published_artifacts if item.hybrid_eligible)
    summary.http_only_fallback_count = sum(1 for item in summary.published_artifacts if item.legacy_http_fallback)

    if not upload_index:
        summary.success = True
        return summary

    index_result = generate_index_from_blobs_with_metadata(
        options,
        options.local_index_path,
        summary.published_artifacts,
        minify=minify_index_json,
        github_repository=github_repository or "HagiCode-org/desktop",
        client=client,
    )
    summary.diagnostics.extend(index_result.diagnostics)
    summary.http_only_fallback_count = max(summary.http_only_fallback_count, index_result.http_only_fallback_count)
    if not index_result.index_json:
        summary.diagnostics.append(
            {
                "artifactName": "index.json",
                "code": "index-generation-failed",
                "message": "索引生成阶段未返回有效的 index.json。",
                "stage": "IndexWrite",
            }
        )
        summary.error_message = "生成 index.json 失败"
        return summary

    summary.index_json = index_result.index_json
    uploaded = upload_index_json(options, index_result.index_json, client=client)
    if not uploaded:
        summary.diagnostics.append(
            {
                "artifactName": "index.json",
                "code": "index-upload-failed",
                "message": "index.json 上传失败。",
                "stage": "IndexWrite",
            }
        )
        summary.error_message = "上传 index.json 失败"
        return summary

    summary.index_uploaded = True
    summary.success = True
    return summary


def report_publish_summary(summary: ReleasePublishSummary) -> None:
    print("[PYBUILD] === Publish summary ===")
    print(f"[PYBUILD]   shard: {summary.shard_id}")
    print(f"[PYBUILD]   success: {summary.success}")
    print(f"[PYBUILD]   eligible assets: {summary.eligible_asset_count}")
    print(f"[PYBUILD]   sidecar success: {summary.sidecar_success_count}")
    print(f"[PYBUILD]   HTTP-only fallback: {summary.http_only_fallback_count}")
    print(f"[PYBUILD]   uploaded blobs: {summary.uploaded_blob_count}")
    print(f"[PYBUILD]   skipped blobs: {summary.skipped_blob_count}")
    print(f"[PYBUILD]   missing blobs: {summary.missing_blob_count}")
    if summary.diagnostics:
        print(f"[PYBUILD]   diagnostics ({len(summary.diagnostics)}):")
        for item in summary.diagnostics:
            print(
                f"[PYBUILD]   - [{item.get('stage')}] {item.get('artifactName')}: "
                f"{item.get('code')} - {item.get('message')}"
            )


def report_index_diagnostics(result: IndexGenerationResult) -> None:
    print("[PYBUILD] === Index summary ===")
    print(f"[PYBUILD]   versions: {result.version_count}")
    print(f"[PYBUILD]   assets: {result.asset_count}")
    print(f"[PYBUILD]   HTTP-only fallback: {result.http_only_fallback_count}")
    for item in result.diagnostics:
        print(
            f"[PYBUILD]   - [{item.get('stage')}] {item.get('artifactName')}: "
            f"{item.get('code')} - {item.get('message')}"
        )


def run_publish_to_azure_blob(repo_root: Path, params: BuildParams) -> int:
    print("[PYBUILD] === Publish GitHub Release to Azure Blob ===")
    print(
        f"[PYBUILD] upload config: Artifacts={params.upload_artifacts}, "
        f"Index={params.upload_index}, Concurrency={params.azure_upload_concurrency}"
    )

    summary = ReleasePublishSummary(
        shard_id=params.publish_shard_id.strip() or "serial",
    )

    try:
        if not params.upload_artifacts and not params.upload_index:
            print("[PYBUILD] no upload options enabled")
            summary.success = True
            export_publish_summary(params, summary)
            return 0

        sas = require_azure_sas(params)
        client = AzureBlobClient(sas)
        if not client.validate():
            raise ValueError("Azure Blob SAS URL 验证失败")

        gh_client = None
        release_tag = ""
        if params.upload_artifacts:
            require_github_token(params)
            gh_client = GitHubReleaseClient(repo_root, params.effective_github_token, params.effective_github_repository)
            release_tag = resolve_release_tag(params, gh_client, require_lookup=True)
        else:
            if params.effective_github_token:
                gh_client = GitHubReleaseClient(
                    repo_root, params.effective_github_token, params.effective_github_repository
                )
                release_tag = resolve_release_tag(params, gh_client, require_lookup=False)
            else:
                release_tag = params.release_tag.strip()

        effective_version = resolve_effective_version(params, release_tag)
        output_path = resolve_index_output_path(repo_root, params)
        publish_options = AzureBlobPublishOptions(
            sas_url=sas,
            upload_retries=params.azure_upload_retries,
            upload_concurrency=params.azure_upload_concurrency,
            version_prefix=effective_version,
            public_base_url=params.azure_public_base_url,
            local_index_path=str(output_path),
        )

        if params.upload_artifacts:
            selection_manifest = load_release_asset_selection_manifest(params)
            if selection_manifest and selection_manifest.get("shardId"):
                summary.shard_id = str(selection_manifest["shardId"])

            downloaded = download_selected_release_assets(
                repo_root, params, release_tag, effective_version, selection_manifest
            )
            if downloaded:
                print("[PYBUILD] === Step 1: upload release assets ===")
                summary = orchestrate_publish(
                    downloaded,
                    publish_options,
                    upload_index=False,  # index handled below (may use merged summary)
                    minify_index_json=params.minify_index_json,
                    github_repository=params.effective_github_repository,
                    client=client,
                )
                if not summary.shard_id:
                    summary.shard_id = (
                        (selection_manifest or {}).get("shardId")
                        or params.publish_shard_id
                        or "serial"
                    )
                report_publish_summary(summary)
            else:
                print("[PYBUILD] no uploadable release assets")
                summary.success = True

        if params.upload_index and not summary.index_uploaded and (summary.success or not params.upload_artifacts):
            print("[PYBUILD] === Step 2: generate and upload index.json ===")
            merged = load_merged_publish_summary(params)
            if merged is not None:
                summary = merged
                summary.shard_id = "finalize"
            index_result = generate_index_from_blobs_with_metadata(
                publish_options,
                output_path,
                summary.published_artifacts,
                minify=params.minify_index_json,
                github_repository=params.effective_github_repository,
                client=client,
            )
            summary.diagnostics.extend(index_result.diagnostics)
            summary.http_only_fallback_count = max(
                summary.http_only_fallback_count, index_result.http_only_fallback_count
            )
            report_index_diagnostics(index_result)
            if not index_result.index_json:
                summary.error_message = "生成 index.json 失败"
                summary.success = False
            elif not upload_index_json(publish_options, index_result.index_json, client=client):
                summary.error_message = "上传 index.json 失败"
                summary.success = False
            else:
                summary.index_json = index_result.index_json
                summary.index_uploaded = True
                summary.success = True
        elif not params.upload_index:
            print("[PYBUILD] skip index upload")
            if not summary.error_message:
                summary.success = True

        if not summary.success and not summary.error_message:
            summary.error_message = "Azure Blob 发布失败"

        print(
            f"[PYBUILD] publish complete: success={summary.success} "
            f"tag={release_tag} version={effective_version}"
        )
        export_publish_summary(params, summary)

        if not summary.success:
            raise RuntimeError(summary.error_message or "Azure Blob 发布失败")
        return 0
    except Exception:
        export_publish_summary(params, summary)
        raise
