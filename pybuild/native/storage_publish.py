"""Storage provider resolution and unified publish/list/index upload entry (R2 only)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .types import BlobInfo, PublishResult
from .params import BuildParams, DEFAULT_PUBLIC_BASE_URL
from . import r2_blob

LOG = "[PYBUILD][storage]"

def _env(name: str, fallback: str = "") -> str:
    value = os.environ.get(name, "").strip()
    return value or fallback

def storage_label(provider: str) -> str:
    return "r2"

@dataclass
class StorageContext:
    public_base_url: str
    cloudflare_public_base_url: str = ""
    version_prefix: str = ""
    upload_retries: int = 3
    upload_concurrency: int = 4
    local_index_path: str = ""
    r2_client: r2_blob.R2BlobClient | None = None

def resolve_public_base(params: BuildParams) -> str:
    base = (
        (params.r2_public_base_url or "").strip()
        or _env("R2_PUBLIC_BASE_URL")
        or (params.azure_public_base_url or "").strip()
        or DEFAULT_PUBLIC_BASE_URL
    )
    return base

def open_storage_context(
    params: BuildParams,
    *,
    public_base: str = "",
    version_prefix: str = "",
    upload_retries: int = 3,
    upload_concurrency: int = 4,
    local_index_path: str = "",
) -> StorageContext:
    provider = "r2"
    ctx = StorageContext(
        public_base_url=(public_base or "").strip()
        or resolve_public_base(params)
        or DEFAULT_PUBLIC_BASE_URL,
        cloudflare_public_base_url=(params.cloudflare_public_base_url or "").strip(),
        version_prefix=version_prefix,
        upload_retries=upload_retries,
        upload_concurrency=upload_concurrency,
        local_index_path=local_index_path,
    )
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
        raise ValueError("R2 config validation failed")
    print(
        f"{LOG} provider=r2 public_base={public_base or '(none)'} "
        f"version_prefix={version_prefix or '(none)'}"
    )
    return ctx

def upload_artifacts(file_paths: list[str], ctx: StorageContext) -> PublishResult:
    if ctx.r2_client is None:
        raise RuntimeError("R2 client not initialized")
    return r2_blob.upload_artifacts(
        file_paths,
        ctx.r2_client,
        version_prefix=ctx.version_prefix,
        max_parallel=ctx.upload_concurrency,
    )

def upload_index(index_json: str, ctx: StorageContext) -> bool:
    if ctx.r2_client is None:
        raise RuntimeError("R2 client not initialized")
    return r2_blob.upload_index_json(ctx.r2_client, index_json)

def list_objects(ctx: StorageContext) -> list[BlobInfo]:
    if ctx.r2_client is None:
        raise RuntimeError("R2 client not initialized")
    return r2_blob.list_objects(ctx.r2_client)

def delete_objects(object_keys: list[str], ctx: StorageContext) -> PublishResult:
    if ctx.r2_client is None:
        raise RuntimeError("R2 client not initialized")
    return r2_blob.delete_objects(ctx.r2_client, object_keys)
