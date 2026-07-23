"""Storage provider resolution and unified publish/list/index upload entry."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .azure_blob import (
    AzureBlobClient,
    AzureBlobPublishOptions,
    BlobInfo,
    PublishResult,
    list_blobs as azure_list_blobs,
    upload_artifacts as azure_upload_artifacts,
    upload_index_json as azure_upload_index_json,
)
from .params import BuildParams, DEFAULT_PUBLIC_BASE_URL
from . import r2_blob

LOG = "[PYBUILD][storage]"


def _env(name: str, fallback: str = "") -> str:
    value = os.environ.get(name, "").strip()
    return value or fallback


def resolve_provider(params: BuildParams | None = None, override: str = "") -> str:
    """Resolve storage provider: CLI/param → env → default r2."""
    candidate = (
        (override or "").strip()
        or (params.storage_provider if params is not None else "")
        or _env("STORAGE_PROVIDER")
        or _env("HAGICODE_STORAGE_PROVIDER")
        or "r2"
    )
    provider = candidate.strip().lower()
    if provider not in {"azure", "r2"}:
        raise ValueError(f"unsupported storage provider '{provider}' (azure|r2)")
    return provider


@dataclass
class StorageContext:
    provider: str
    public_base_url: str
    version_prefix: str = ""
    upload_retries: int = 3
    upload_concurrency: int = 4
    local_index_path: str = ""
    # Azure
    sas_url: str = ""
    azure_client: AzureBlobClient | None = None
    # R2
    r2_client: r2_blob.R2BlobClient | None = None


def resolve_public_base(params: BuildParams, provider: str) -> str:
    if provider == "r2":
        base = (
            (params.r2_public_base_url or "").strip()
            or _env("R2_PUBLIC_BASE_URL")
            or (params.azure_public_base_url or "").strip()
            or DEFAULT_PUBLIC_BASE_URL
        )
    else:
        base = (params.azure_public_base_url or "").strip() or DEFAULT_PUBLIC_BASE_URL
    return base.rstrip("/")


def require_storage_credentials(params: BuildParams, provider: str | None = None) -> str:
    """Validate credentials for resolved provider; return provider name."""
    resolved = resolve_provider(params, provider or "")
    if resolved == "azure":
        sas = params.effective_azure_blob_sas_url
        if not sas:
            raise ValueError(
                "必须配置 Azure Blob SAS URL（--azure-blob-sas-url 或 AZURE_BLOB_SAS_URL）；"
                "或改用 storage.provider=r2 并配置 R2 凭证。"
            )
        return resolved

    endpoint = (params.r2_endpoint or "").strip() or _env("R2_ENDPOINT")
    bucket = (params.r2_bucket or "").strip() or _env("R2_BUCKET")
    access_key = (params.r2_access_key or "").strip() or _env("R2_ACCESS_KEY")
    secret_key = (params.r2_secret_key or "").strip() or _env("R2_SECRET_KEY")
    missing = [
        name
        for name, value in (
            ("R2_ENDPOINT", endpoint),
            ("R2_BUCKET", bucket),
            ("R2_ACCESS_KEY", access_key),
            ("R2_SECRET_KEY", secret_key),
        )
        if not value
    ]
    if missing:
        raise ValueError(
            "R2 凭证不完整，缺少: "
            + ", ".join(missing)
            + "（CLI --r2-* 或 env R2_*）；或显式 --storage-provider azure 并配置 SAS。"
        )
    return resolved


def open_storage_context(
    params: BuildParams,
    *,
    version_prefix: str = "",
    local_index_path: str = "",
) -> StorageContext:
    provider = require_storage_credentials(params)
    public_base = resolve_public_base(params, provider)
    ctx = StorageContext(
        provider=provider,
        public_base_url=public_base,
        version_prefix=version_prefix,
        upload_retries=params.azure_upload_retries,
        upload_concurrency=params.azure_upload_concurrency,
        local_index_path=local_index_path,
    )
    if provider == "azure":
        sas = params.effective_azure_blob_sas_url
        client = AzureBlobClient(sas)
        if not client.validate():
            raise ValueError("Azure Blob SAS URL 验证失败")
        ctx.sas_url = sas
        ctx.azure_client = client
    else:
        endpoint = (params.r2_endpoint or "").strip() or _env("R2_ENDPOINT")
        bucket = (params.r2_bucket or "").strip() or _env("R2_BUCKET")
        access_key = (params.r2_access_key or "").strip() or _env("R2_ACCESS_KEY")
        secret_key = (params.r2_secret_key or "").strip() or _env("R2_SECRET_KEY")
        region = (params.r2_region or "").strip() or _env("R2_REGION") or "auto"
        path_style = params.r2_path_style
        ctx.r2_client = r2_blob.R2BlobClient(
            endpoint=endpoint,
            bucket=bucket,
            access_key=access_key,
            secret_key=secret_key,
            region=region,
            public_base_url=public_base,
            path_style=path_style,
        )
        if not ctx.r2_client.validate():
            raise ValueError("R2 配置验证失败")
    print(
        f"{LOG} provider={provider} public_base={public_base or '(none)'} "
        f"version_prefix={version_prefix or '(none)'}"
    )
    return ctx


def to_azure_options(ctx: StorageContext) -> AzureBlobPublishOptions:
    """Build AzureBlobPublishOptions for index/metadata helpers (public base + optional SAS)."""
    return AzureBlobPublishOptions(
        sas_url=ctx.sas_url,
        version_prefix=ctx.version_prefix,
        public_base_url=ctx.public_base_url,
        upload_retries=ctx.upload_retries,
        upload_concurrency=ctx.upload_concurrency,
        local_index_path=ctx.local_index_path,
    )


def upload_artifacts(file_paths: list[str], ctx: StorageContext) -> PublishResult:
    if ctx.provider == "azure":
        if ctx.azure_client is None:
            raise RuntimeError("Azure client not initialized")
        options = to_azure_options(ctx)
        return azure_upload_artifacts(file_paths, options, client=ctx.azure_client)
    if ctx.r2_client is None:
        raise RuntimeError("R2 client not initialized")
    return r2_blob.upload_artifacts(
        file_paths,
        client=ctx.r2_client,
        version_prefix=ctx.version_prefix,
        upload_retries=ctx.upload_retries,
        upload_concurrency=ctx.upload_concurrency,
    )


def list_objects(ctx: StorageContext) -> list[BlobInfo]:
    if ctx.provider == "azure":
        if ctx.azure_client is None:
            raise RuntimeError("Azure client not initialized")
        return azure_list_blobs(to_azure_options(ctx), client=ctx.azure_client)
    if ctx.r2_client is None:
        raise RuntimeError("R2 client not initialized")
    return r2_blob.list_objects(ctx.r2_client)


def upload_index(ctx: StorageContext, index_json: str) -> bool:
    if ctx.provider == "azure":
        if ctx.azure_client is None:
            raise RuntimeError("Azure client not initialized")
        return azure_upload_index_json(to_azure_options(ctx), index_json, client=ctx.azure_client)
    if ctx.r2_client is None:
        raise RuntimeError("R2 client not initialized")
    return r2_blob.upload_index_json(ctx.r2_client, index_json)


def storage_label(provider: str) -> str:
    return "R2" if provider == "r2" else "Azure Blob"
