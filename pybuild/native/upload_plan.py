from __future__ import annotations

from pathlib import Path
from typing import Any

from .artifacts import resolve_matrix_output_path, resolve_plan_output_path, write_camel_json
from .github_release import GitHubReleaseClient
from .params import (
    BuildParams,
    normalize_published_version_prefix,
    require_github_token,
)


def create_upload_plan(
    *,
    tag: str,
    version_prefix: str,
    release_channel: str,
    max_parallel: int,
    client: GitHubReleaseClient,
) -> dict[str, Any]:
    assets = client.get_release_assets(tag)
    eligible_assets: list[dict[str, Any]] = []
    skipped_assets: list[str] = []

    for asset in sorted(assets, key=lambda item: item.name.lower()):
        if client.is_source_archive(asset.name, tag, version_prefix):
            skipped_assets.append(asset.name)
            continue
        eligible_assets.append({"name": asset.name, "size": asset.size})

    shards: list[dict[str, Any]] = []
    for index, asset in enumerate(eligible_assets):
        shards.append(
            {
                "shard_id": f"shard-{index + 1:03d}",
                "assets": [asset],
                "asset_count": 1,
                "total_size_bytes": asset["size"],
            }
        )

    return {
        "release_tag": tag,
        "release_channel": release_channel,
        "version_prefix": version_prefix,
        "repository": client.github_repository,
        "max_parallel": max(1, max_parallel),
        "eligible_assets": eligible_assets,
        "skipped_assets": skipped_assets,
        "shards": shards,
    }


def build_matrix_document(upload_plan: dict[str, Any]) -> dict[str, Any]:
    shards = []
    for shard in upload_plan.get("shards", []):
        assets = shard.get("assets") or []
        entry = {
            "shard_id": shard.get("shard_id"),
            "asset_count": shard.get("asset_count"),
            "total_size_bytes": shard.get("total_size_bytes"),
            "assets": assets,
            "asset_name": assets[0]["name"] if len(assets) == 1 else "",
            "asset_size": assets[0]["size"] if len(assets) == 1 else 0,
        }
        shards.append(entry)
    return {"shard": shards}


def resolve_release_tag(params: BuildParams, client: GitHubReleaseClient, *, require_lookup: bool) -> str:
    if params.release_tag.strip():
        print(f"[PYBUILD] using ReleaseTag: {params.release_tag.strip()}")
        return params.release_tag.strip()

    if not require_lookup and not params.effective_github_token:
        print("[PYBUILD] no ReleaseTag and lookup not required")
        return ""

    require_github_token(params)
    print("[PYBUILD] resolving latest release tag via GitHub")
    latest = client.get_latest_release_tag()
    if not latest:
        raise ValueError("无法从 GitHub 获取最新 release tag")
    return latest


def resolve_effective_version(params: BuildParams, release_tag: str) -> str:
    seed = params.release_version.strip() or release_tag.strip() or "1.0.0"
    return normalize_published_version_prefix(seed)


def run_generate_azure_upload_plan(repo_root: Path, params: BuildParams) -> int:
    from .storage_publish import resolve_provider

    provider = resolve_provider(params)
    print(f"[PYBUILD] === Generate Azure Upload Plan (provider={provider}) ===")
    token = require_github_token(params)
    client = GitHubReleaseClient(repo_root, token, params.effective_github_repository)

    release_tag = resolve_release_tag(params, client, require_lookup=True)
    effective_version = resolve_effective_version(params, release_tag)
    upload_plan = create_upload_plan(
        tag=release_tag,
        version_prefix=effective_version,
        release_channel=params.release_channel or "beta",
        max_parallel=params.azure_max_parallel,
        client=client,
    )

    plan_path = resolve_plan_output_path(repo_root, params)
    matrix_path = resolve_matrix_output_path(repo_root, params)
    matrix_document = build_matrix_document(upload_plan)

    write_camel_json(plan_path, upload_plan, minify=False)
    write_camel_json(matrix_path, matrix_document, minify=False)

    print(f"[PYBUILD] Storage provider: {provider}")
    print(f"[PYBUILD] Release tag: {release_tag}")
    print(f"[PYBUILD] Version prefix: {effective_version}")
    print(f"[PYBUILD] Eligible assets: {len(upload_plan['eligible_assets'])}")
    print(f"[PYBUILD] Skipped source archives: {len(upload_plan['skipped_assets'])}")
    print(f"[PYBUILD] Planned shards: {len(upload_plan['shards'])}")
    print(f"[PYBUILD] Workflow max parallel: {upload_plan['max_parallel']}")
    print(f"[PYBUILD] Plan output: {plan_path}")
    print(f"[PYBUILD] Matrix output: {matrix_path}")
    return 0
