"""Cloudflare R2 (S3-compatible) upload/list helpers for desktop pybuild."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from .azure_blob import BlobInfo, PublishResult
from .path_utils import build_blob_path

LOG = "[PYBUILD][r2]"


def _boto3_client(
    *,
    endpoint: str,
    access_key: str,
    secret_key: str,
    region: str = "auto",
    path_style: bool = True,
):
    try:
        import boto3
        from botocore.client import Config
    except ImportError as exc:
        raise RuntimeError(
            "boto3 required for R2 publish. Install via requirements.lock.txt (boto3)."
        ) from exc

    endpoint_url = (endpoint or "").strip().rstrip("/")
    if not endpoint_url:
        raise RuntimeError("R2 endpoint not configured (--r2-endpoint or R2_ENDPOINT)")
    if not access_key or not secret_key:
        raise RuntimeError("R2 credentials missing (R2_ACCESS_KEY / R2_SECRET_KEY)")

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=(region or "auto").strip() or "auto",
        config=Config(s3={"addressing_style": "path" if path_style else "auto"}),
    )


class R2BlobClient:
    """Minimal R2 client over boto3 S3 API."""

    def __init__(
        self,
        *,
        endpoint: str,
        bucket: str,
        access_key: str,
        secret_key: str,
        region: str = "auto",
        public_base_url: str = "",
        path_style: bool = True,
    ) -> None:
        self.endpoint = (endpoint or "").strip().rstrip("/")
        self.bucket = (bucket or "").strip()
        self.public_base_url = (public_base_url or "").strip().rstrip("/")
        self.region = (region or "auto").strip() or "auto"
        self.path_style = path_style
        if not self.bucket:
            raise ValueError("R2 bucket is required")
        self._client = _boto3_client(
            endpoint=self.endpoint,
            access_key=access_key,
            secret_key=secret_key,
            region=self.region,
            path_style=path_style,
        )

    def validate(self) -> bool:
        return bool(self.endpoint and self.bucket)

    def object_public_uri(self, object_key: str) -> str:
        key = object_key.lstrip("/")
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        # Fallback path-style URL (may not be publicly reachable without custom domain)
        return f"{self.endpoint}/{self.bucket}/{key}"

    def head_object(self, object_key: str) -> dict | None:
        try:
            return self._client.head_object(Bucket=self.bucket, Key=object_key)
        except Exception:  # noqa: BLE001
            return None

    def exists(self, object_key: str) -> bool:
        return self.head_object(object_key) is not None

    def upload_file(self, object_key: str, file_path: Path, retries: int = 3) -> None:
        attempts = max(1, retries + 1)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                try:
                    self._client.upload_file(
                        str(file_path),
                        self.bucket,
                        object_key,
                        ExtraArgs={"ContentType": "application/octet-stream"},
                    )
                except TypeError:
                    self._client.upload_file(str(file_path), self.bucket, object_key)
                return
            except Exception as error:  # noqa: BLE001
                last_error = error
                if attempt < attempts:
                    print(
                        f"{LOG} upload attempt {attempt}/{attempts} failed "
                        f"for {object_key}: {error}"
                    )
                    time.sleep(min(2 * attempt, 10))
                else:
                    break
        # Final fallback: PutObject body stream
        try:
            with file_path.open("rb") as fh:
                self._client.put_object(
                    Bucket=self.bucket,
                    Key=object_key,
                    Body=fh,
                    ContentType="application/octet-stream",
                )
            return
        except Exception as error:  # noqa: BLE001
            last_error = error
        raise last_error or RuntimeError(f"上传 {object_key} 失败")

    def upload_bytes(
        self,
        object_key: str,
        data: bytes,
        content_type: str | None = None,
    ) -> None:
        self._client.put_object(
            Bucket=self.bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )

    def list_objects(self) -> list[BlobInfo]:
        keys: list[BlobInfo] = []
        token = None
        while True:
            kwargs: dict = {"Bucket": self.bucket}
            if token:
                kwargs["ContinuationToken"] = token
            resp = self._client.list_objects_v2(**kwargs)
            for item in resp.get("Contents") or []:
                key = item.get("Key") or ""
                if not key:
                    continue
                last_modified = item.get("LastModified")
                if isinstance(last_modified, datetime):
                    modified = last_modified
                    if modified.tzinfo is None:
                        modified = modified.replace(tzinfo=timezone.utc)
                else:
                    modified = datetime.now(timezone.utc)
                keys.append(
                    BlobInfo(
                        name=key,
                        size=int(item.get("Size") or 0),
                        last_modified=modified,
                    )
                )
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return keys


def should_skip_upload(client: R2BlobClient, object_key: str, file_path: Path) -> bool:
    head = client.head_object(object_key)
    if head is None:
        return False
    remote_size = int(head.get("ContentLength") or -1)
    try:
        local_size = file_path.stat().st_size
    except OSError:
        return False
    return remote_size == local_size and local_size >= 0


def upload_artifacts(
    file_paths: list[str],
    *,
    client: R2BlobClient,
    version_prefix: str = "",
    upload_retries: int = 3,
    upload_concurrency: int = 4,
) -> PublishResult:
    result = PublishResult()
    print(f"{LOG} bucket: {client.bucket}")
    print(f"{LOG} version prefix: {version_prefix or '(none)'}")

    distinct_files = sorted({path for path in file_paths if path}, key=str.lower)
    concurrency = max(1, upload_concurrency)

    def _upload_one(file_path: str) -> tuple[str, str, str | None]:
        path = Path(file_path)
        file_name = path.name
        object_key = build_blob_path(version_prefix, file_name)
        if not path.is_file():
            return "missing", object_key, f"missing file: {file_path}"
        try:
            if should_skip_upload(client, object_key, path):
                return "skipped", object_key, client.object_public_uri(object_key)
            print(f"{LOG} Uploading: {file_name} -> {client.bucket}/{object_key}")
            client.upload_file(object_key, path, retries=upload_retries)
            url = client.object_public_uri(object_key)
            print(f"{LOG} Upload successful: {url}")
            return "uploaded", object_key, url
        except Exception as error:  # noqa: BLE001
            return "failed", object_key, str(error)

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(_upload_one, path): path for path in distinct_files}
        for future in as_completed(futures):
            status, object_key, detail = future.result()
            if status == "uploaded":
                result.uploaded_blob_names.append(object_key)
                result.uploaded_blobs.append(detail or "")
            elif status == "skipped":
                result.skipped_blob_names.append(object_key)
                result.skipped_blobs.append(detail or "")
            elif status == "missing":
                result.missing_blob_names.append(object_key)
                result.errors.append(f"{object_key}: {detail}")
            else:
                result.failed_blob_names.append(object_key)
                result.errors.append(f"{object_key}: {detail}")

    if result.failed_blob_names or result.missing_blob_names:
        result.success = False
        result.error_message = "; ".join(result.errors) if result.errors else "upload failed"
    else:
        result.success = True
    return result


def upload_index_json(client: R2BlobClient, index_json: str) -> bool:
    try:
        print(f"{LOG} Uploading index.json to R2 bucket {client.bucket}...")
        client.upload_bytes("index.json", index_json.encode("utf-8"), content_type="application/json")
        print(f"{LOG} index.json uploaded successfully: {client.object_public_uri('index.json')}")
        return True
    except Exception as error:  # noqa: BLE001
        print(f"{LOG} Failed to upload index.json: {error}")
        return False


def list_objects(client: R2BlobClient) -> list[BlobInfo]:
    print(f"{LOG} Listing objects in bucket: {client.bucket}")
    blobs = client.list_objects()
    print(f"{LOG} Listed {len(blobs)} objects")
    return blobs
