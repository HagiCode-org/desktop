from __future__ import annotations

import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .path_utils import build_blob_path


@dataclass
class BlobInfo:
    name: str
    size: int
    last_modified: datetime


@dataclass
class PublishResult:
    success: bool = False
    uploaded_blobs: list[str] = field(default_factory=list)
    uploaded_blob_names: list[str] = field(default_factory=list)
    skipped_blobs: list[str] = field(default_factory=list)
    skipped_blob_names: list[str] = field(default_factory=list)
    missing_blob_names: list[str] = field(default_factory=list)
    failed_blob_names: list[str] = field(default_factory=list)
    error_message: str = ""
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class AzureBlobPublishOptions:
    sas_url: str
    version_prefix: str = ""
    public_base_url: str = ""
    upload_retries: int = 3
    upload_concurrency: int = 4
    local_index_path: str = ""


class AzureBlobClient:
    """Minimal Azure Blob REST client using container SAS URL."""

    def __init__(self, sas_url: str) -> None:
        self.sas_url = sas_url
        parsed = urlparse(sas_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("Invalid SAS URL")
        self._scheme = parsed.scheme
        self._netloc = parsed.netloc
        self._container_path = parsed.path.rstrip("/")
        self._query = parsed.query
        parts = [part for part in self._container_path.split("/") if part]
        self.container_name = parts[-1] if parts else ""

    def validate(self) -> bool:
        try:
            urlparse(self.sas_url)
            return bool(self.sas_url)
        except Exception:  # noqa: BLE001
            return False

    def _blob_url(self, blob_name: str) -> str:
        encoded_name = "/".join(part for part in blob_name.split("/") if part is not None)
        # Azure accepts unescaped path segments for simple names; keep slashes.
        from urllib.parse import quote

        segments = [quote(segment, safe="") for segment in encoded_name.split("/") if segment != ""]
        path = self._container_path + "/" + "/".join(segments)
        return f"{self._scheme}://{self._netloc}{path}?{self._query}"

    def _container_list_url(self) -> str:
        # List blobs: GET {container}?restype=container&comp=list&{sas}
        joiner = "&" if self._query else ""
        return f"{self._scheme}://{self._netloc}{self._container_path}?restype=container&comp=list{joiner}{self._query}"

    def blob_public_uri(self, blob_name: str) -> str:
        # URI without SAS for logging/URLs
        path = self._container_path + "/" + blob_name
        return f"{self._scheme}://{self._netloc}{path}"

    def exists(self, blob_name: str) -> bool:
        url = self._blob_url(blob_name)
        request = Request(url, method="HEAD")
        try:
            with urlopen(request, timeout=60) as response:  # noqa: S310
                return 200 <= response.status < 300
        except HTTPError as error:
            if error.code == 404:
                return False
            raise
        except URLError:
            return False

    def get_content_md5(self, blob_name: str) -> bytes | None:
        url = self._blob_url(blob_name)
        request = Request(url, method="HEAD")
        try:
            with urlopen(request, timeout=60) as response:  # noqa: S310
                value = response.headers.get("Content-MD5")
                if not value:
                    return None
                import base64

                return base64.b64decode(value)
        except HTTPError as error:
            if error.code == 404:
                return None
            raise

    def upload_bytes(self, blob_name: str, data: bytes, content_type: str | None = None) -> None:
        url = self._blob_url(blob_name)
        headers = {
            "x-ms-blob-type": "BlockBlob",
            "Content-Length": str(len(data)),
        }
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(url, data=data, method="PUT", headers=headers)
        with urlopen(request, timeout=300) as response:  # noqa: S310
            if response.status not in (200, 201):
                raise RuntimeError(f"Upload failed with status {response.status}")

    def upload_file(self, blob_name: str, file_path: Path, retries: int = 3) -> None:
        attempts = max(1, retries + 1)
        last_error: Exception | None = None
        data = file_path.read_bytes()
        content_type = _guess_content_type(file_path.name)
        for attempt in range(1, attempts + 1):
            try:
                self.upload_bytes(blob_name, data, content_type=content_type)
                return
            except Exception as error:  # noqa: BLE001
                last_error = error
                if attempt < attempts:
                    print(f"[PYBUILD] upload attempt {attempt}/{attempts} failed for {blob_name}: {error}")
                    time.sleep(min(2 * attempt, 10))
                else:
                    break
        raise last_error or RuntimeError(f"上传 {blob_name} 失败")

    def list_blobs(self) -> list[BlobInfo]:
        import xml.etree.ElementTree as ET

        blobs: list[BlobInfo] = []
        marker: str | None = None
        while True:
            url = self._container_list_url()
            if marker:
                url += f"&marker={marker}"
            request = Request(url, method="GET")
            with urlopen(request, timeout=120) as response:  # noqa: S310
                payload = response.read()
            root = ET.fromstring(payload)
            # Azure XML may use default namespace
            ns = ""
            if root.tag.startswith("{"):
                ns = root.tag.split("}")[0] + "}"

            for blob_el in root.findall(f".//{ns}Blob"):
                name_el = blob_el.find(f"{ns}Name")
                props = blob_el.find(f"{ns}Properties")
                if name_el is None or name_el.text is None:
                    continue
                size = 0
                last_modified = datetime.min.replace(tzinfo=timezone.utc)
                if props is not None:
                    length_el = props.find(f"{ns}Content-Length")
                    if length_el is not None and length_el.text:
                        size = int(length_el.text)
                    lm_el = props.find(f"{ns}Last-Modified")
                    if lm_el is not None and lm_el.text:
                        try:
                            last_modified = datetime.strptime(
                                lm_el.text, "%a, %d %b %Y %H:%M:%S %Z"
                            ).replace(tzinfo=timezone.utc)
                        except ValueError:
                            last_modified = datetime.now(tz=timezone.utc)
                blobs.append(BlobInfo(name=name_el.text, size=size, last_modified=last_modified))

            next_marker_el = root.find(f"{ns}NextMarker")
            marker = next_marker_el.text if next_marker_el is not None and next_marker_el.text else None
            if not marker:
                break
        return blobs


def _guess_content_type(file_name: str) -> str:
    lower = file_name.lower()
    if lower.endswith(".json"):
        return "application/json"
    if lower.endswith(".torrent"):
        return "application/x-bittorrent"
    if lower.endswith(".zip"):
        return "application/zip"
    if lower.endswith(".dmg"):
        return "application/x-apple-diskimage"
    if lower.endswith(".exe"):
        return "application/vnd.microsoft.portable-executable"
    if lower.endswith(".AppImage".lower()) or lower.endswith(".appimage"):
        return "application/octet-stream"
    if lower.endswith(".deb"):
        return "application/vnd.debian.binary-package"
    if lower.endswith(".rpm"):
        return "application/x-rpm"
    if lower.endswith(".blockmap"):
        return "application/octet-stream"
    if lower.endswith(".yml") or lower.endswith(".yaml"):
        return "text/yaml"
    if lower.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def _file_md5(path: Path) -> bytes:
    digest = hashlib.md5()  # noqa: S324 - match Azure Content-MD5
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.digest()


def should_skip_upload(client: AzureBlobClient, blob_name: str, file_path: Path) -> bool:
    if not client.exists(blob_name):
        return False
    remote_hash = client.get_content_md5(blob_name)
    local_hash = _file_md5(file_path)
    if remote_hash is None or remote_hash != local_hash:
        return False
    print(f"[PYBUILD] Skipping {file_path.name} (unchanged, hash: {local_hash.hex()[:8]})")
    return True


def upload_artifacts(
    file_paths: list[str],
    options: AzureBlobPublishOptions,
    *,
    client: AzureBlobClient | None = None,
) -> PublishResult:
    result = PublishResult()
    if not options.sas_url.strip():
        result.success = False
        result.error_message = "SAS URL cannot be empty"
        return result

    blob_client = client or AzureBlobClient(options.sas_url)
    print(f"[PYBUILD] Container: {blob_client.container_name}")
    print(f"[PYBUILD] Version prefix: {options.version_prefix or '(none)'}")

    distinct_files = sorted({path for path in file_paths if path}, key=str.lower)
    concurrency = max(1, options.upload_concurrency)

    def _upload_one(file_path: str) -> tuple[str, str, str | None]:
        """Returns (status, blob_name, url_or_error). status: uploaded|skipped|missing|failed"""
        path = Path(file_path)
        file_name = path.name
        blob_name = build_blob_path(options.version_prefix, file_name)
        if not path.is_file():
            return "missing", blob_name, f"missing file: {file_path}"
        try:
            if should_skip_upload(blob_client, blob_name, path):
                return "skipped", blob_name, blob_client.blob_public_uri(blob_name)
            print(f"[PYBUILD] Uploading: {file_name} -> {blob_client.container_name}/{blob_name}")
            blob_client.upload_file(blob_name, path, retries=options.upload_retries)
            url = blob_client.blob_public_uri(blob_name)
            print(f"[PYBUILD] Upload successful: {url}")
            return "uploaded", blob_name, url
        except Exception as error:  # noqa: BLE001
            return "failed", blob_name, str(error)

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(_upload_one, path): path for path in distinct_files}
        for future in as_completed(futures):
            status, blob_name, detail = future.result()
            if status == "uploaded":
                result.uploaded_blob_names.append(blob_name)
                result.uploaded_blobs.append(detail or "")
            elif status == "skipped":
                result.skipped_blob_names.append(blob_name)
                result.skipped_blobs.append(detail or "")
            elif status == "missing":
                result.missing_blob_names.append(blob_name)
                result.errors.append(f"{blob_name}: {detail}")
            else:
                result.failed_blob_names.append(blob_name)
                result.errors.append(f"{blob_name}: {detail}")

    result.uploaded_blob_names.sort(key=str.lower)
    result.uploaded_blobs.sort(key=str.lower)
    result.skipped_blob_names.sort(key=str.lower)
    result.skipped_blobs.sort(key=str.lower)
    result.missing_blob_names.sort(key=str.lower)
    result.failed_blob_names.sort(key=str.lower)
    result.errors.sort(key=str.lower)
    result.success = len(result.errors) == 0
    result.error_message = "" if result.success else "; ".join(result.errors)
    return result


def upload_index_json(options: AzureBlobPublishOptions, index_json: str, *, client: AzureBlobClient | None = None) -> bool:
    try:
        if not options.sas_url.strip():
            print("[PYBUILD] SAS URL is required for upload")
            return False
        blob_client = client or AzureBlobClient(options.sas_url)
        print("[PYBUILD] Uploading index.json to Azure Blob Storage...")
        blob_client.upload_bytes("index.json", index_json.encode("utf-8"), content_type="application/json")
        print(f"[PYBUILD] index.json uploaded successfully: {blob_client.blob_public_uri('index.json')}")
        return True
    except Exception as error:  # noqa: BLE001
        print(f"[PYBUILD] Failed to upload index.json: {error}")
        return False


def list_blobs(options: AzureBlobPublishOptions, *, client: AzureBlobClient | None = None) -> list[BlobInfo]:
    if not options.sas_url.strip():
        print("[PYBUILD] SAS URL is required to list blobs")
        return []
    blob_client = client or AzureBlobClient(options.sas_url)
    print(f"[PYBUILD] Listing blobs in container: {blob_client.container_name}")
    blobs = [blob for blob in blob_client.list_blobs() if blob.name != "index.json"]
    print(f"[PYBUILD] Found {len(blobs)} blobs")
    return blobs


def validate_index_file(path: Path | str) -> bool:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return isinstance(data, dict) and "versions" in data
    except Exception:  # noqa: BLE001
        return False
