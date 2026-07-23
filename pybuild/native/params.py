from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Iterable

DEFAULT_GITHUB_REPOSITORY = "HagiCode-org/desktop"
DEFAULT_PUBLIC_BASE_URL = "https://desktop.dl.hagicode.com"
DEFAULT_RELEASE_CHANNEL = "beta"
DEFAULT_AZURE_MAX_PARALLEL = 3
DEFAULT_AZURE_UPLOAD_RETRIES = 3
DEFAULT_AZURE_UPLOAD_CONCURRENCY = 4


def _normalize_key(raw: str) -> str:
    text = raw.strip().lstrip("-")
    text = text.replace("-", "").replace("_", "")
    return text.lower()


def _to_bool(value: str | bool | None, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _to_int(value: str | int | None, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass
class BuildParams:
    verbose: bool = False
    azure_blob_sas_url: str = ""
    azure_public_base_url: str = DEFAULT_PUBLIC_BASE_URL
    skip_azure_blob_publish: bool = False
    azure_generate_index: bool = True
    azure_upload_retries: int = DEFAULT_AZURE_UPLOAD_RETRIES
    azure_upload_concurrency: int = DEFAULT_AZURE_UPLOAD_CONCURRENCY
    minify_index_json: bool = True
    azure_index_output_path: str = ""
    azure_upload_plan_output_path: str = ""
    azure_upload_matrix_output_path: str = ""
    upload_artifacts: bool = True
    upload_index: bool = True
    release_assets_manifest: str = ""
    publish_result_output_path: str = ""
    merged_publish_results_manifest: str = ""
    publish_shard_id: str = ""
    azure_max_parallel: int = DEFAULT_AZURE_MAX_PARALLEL
    github_token: str = ""
    github_repository: str = DEFAULT_GITHUB_REPOSITORY
    release_tag: str = ""
    release_version: str = ""
    release_channel: str = DEFAULT_RELEASE_CHANNEL
    channel_mapping: str = ""
    feishu_webhook_url: str = ""
    github_run_url: str = ""
    github_sha: str = ""
    github_actor: str = ""
    unrecognized: list[str] = field(default_factory=list)

    @property
    def effective_github_token(self) -> str:
        return (
            self.github_token
            or os.environ.get("GITHUB_TOKEN", "")
            or os.environ.get("GH_TOKEN", "")
            or os.environ.get("GitHubToken", "")
        ).strip()

    @property
    def effective_azure_blob_sas_url(self) -> str:
        return (
            self.azure_blob_sas_url
            or os.environ.get("AZURE_BLOB_SAS_URL", "")
            or os.environ.get("AzureBlobSasUrl", "")
        ).strip()

    @property
    def effective_github_repository(self) -> str:
        env_repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
        return normalize_github_repository(env_repo or self.github_repository)


PARAM_ALIASES: dict[str, str] = {
    "verbose": "verbose",
    "azureblobsasurl": "azure_blob_sas_url",
    "azurepublicbaseurl": "azure_public_base_url",
    "skipazureblobpublish": "skip_azure_blob_publish",
    "azuregenerateindex": "azure_generate_index",
    "azureuploadretries": "azure_upload_retries",
    "azureuploadconcurrency": "azure_upload_concurrency",
    "minifyindexjson": "minify_index_json",
    "azureindexoutputpath": "azure_index_output_path",
    "azureuploadplanoutputpath": "azure_upload_plan_output_path",
    "azureuploadmatrixoutputpath": "azure_upload_matrix_output_path",
    "uploadartifacts": "upload_artifacts",
    "uploadindex": "upload_index",
    "releaseassetsmanifest": "release_assets_manifest",
    "publishresultoutputpath": "publish_result_output_path",
    "mergedpublishresultsmanifest": "merged_publish_results_manifest",
    "publishshardid": "publish_shard_id",
    "azuremaxparallel": "azure_max_parallel",
    "githubtoken": "github_token",
    "githubrepository": "github_repository",
    "releasetag": "release_tag",
    "releaseversion": "release_version",
    "releasechannel": "release_channel",
    "channelmapping": "channel_mapping",
    "feishuwebhookurl": "feishu_webhook_url",
    "githubrunurl": "github_run_url",
    "githubsha": "github_sha",
    "githubactor": "github_actor",
}

BOOL_FIELDS = {
    "verbose",
    "skip_azure_blob_publish",
    "azure_generate_index",
    "minify_index_json",
    "upload_artifacts",
    "upload_index",
}

INT_FIELDS = {
    "azure_upload_retries",
    "azure_upload_concurrency",
    "azure_max_parallel",
}


def parse_passthrough(args: Iterable[str]) -> BuildParams:
    params = BuildParams()
    tokens = list(args)
    values: dict[str, str] = {}
    unrecognized: list[str] = []

    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token == "--":
            unrecognized.extend(tokens[i + 1 :])
            break

        if token.startswith("--"):
            if "=" in token:
                raw_key, raw_value = token[2:].split("=", 1)
                key = _normalize_key(raw_key)
                field_name = PARAM_ALIASES.get(key)
                if field_name is None:
                    unrecognized.append(token)
                else:
                    values[field_name] = raw_value
                i += 1
                continue

            key = _normalize_key(token)
            field_name = PARAM_ALIASES.get(key)
            if field_name is None:
                unrecognized.append(token)
                if i + 1 < len(tokens) and not tokens[i + 1].startswith("--"):
                    unrecognized.append(tokens[i + 1])
                    i += 2
                else:
                    i += 1
                continue

            if i + 1 < len(tokens) and not tokens[i + 1].startswith("--"):
                values[field_name] = tokens[i + 1]
                i += 2
            else:
                # bare flag => true for booleans
                if field_name in BOOL_FIELDS:
                    values[field_name] = "true"
                i += 1
            continue

        unrecognized.append(token)
        i += 1

    for field_name, raw in values.items():
        if field_name in BOOL_FIELDS:
            setattr(params, field_name, _to_bool(raw, getattr(params, field_name)))
        elif field_name in INT_FIELDS:
            setattr(params, field_name, _to_int(raw, getattr(params, field_name)))
        else:
            setattr(params, field_name, raw)

    # Env fallbacks for critical secrets when not provided via CLI
    if not params.github_token:
        params.github_token = (
            os.environ.get("GITHUB_TOKEN")
            or os.environ.get("GH_TOKEN")
            or os.environ.get("GitHubToken")
            or ""
        )
    if not params.azure_blob_sas_url:
        params.azure_blob_sas_url = (
            os.environ.get("AZURE_BLOB_SAS_URL")
            or os.environ.get("AzureBlobSasUrl")
            or ""
        )
    if params.github_repository == DEFAULT_GITHUB_REPOSITORY:
        env_repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
        if env_repo:
            params.github_repository = env_repo

    params.unrecognized = unrecognized
    return params


def normalize_github_repository(repository: str | None) -> str:
    value = (repository or "").strip().strip("/")
    return value or DEFAULT_GITHUB_REPOSITORY


def resolve_github_repository_name(repository: str | None) -> str:
    value = normalize_github_repository(repository)
    segments = [part for part in value.split("/") if part]
    return segments[-1] if segments else value


def normalize_published_version_prefix(version_or_tag: str) -> str:
    normalized = (version_or_tag or "").strip()
    if not normalized:
        return normalized
    normalized = normalized.lstrip("vV")
    return f"v{normalized}"


def require_github_token(params: BuildParams) -> str:
    token = params.effective_github_token
    if token:
        return token
    raise ValueError(
        "必须配置 GitHub Token。"
        " CI: 设置 GITHUB_TOKEN；本地: --github-token。"
    )


def require_azure_sas(params: BuildParams) -> str:
    sas = params.effective_azure_blob_sas_url
    if sas:
        return sas
    raise ValueError("必须配置 Azure Blob SAS URL（--azure-blob-sas-url 或 AZURE_BLOB_SAS_URL）")
