from __future__ import annotations

from urllib.parse import urljoin, urlparse, urlunparse


def normalize_version_prefix(version_prefix: str | None) -> str:
    if not version_prefix or not str(version_prefix).strip():
        return ""
    return str(version_prefix).strip().strip("/").replace("\\", "/")


def build_blob_path(version_prefix: str | None, file_name: str) -> str:
    normalized_prefix = normalize_version_prefix(version_prefix)
    normalized_file_name = file_name.replace("\\", "/")
    if not normalized_prefix:
        return normalized_file_name
    return f"{normalized_prefix}/{normalized_file_name}"


def build_container_base_url(sas_url: str) -> str:
    uri = urlparse(sas_url)
    path = uri.path.rstrip("/") + "/"
    return urlunparse((uri.scheme, uri.netloc, path, "", "", ""))


def resolve_public_base_url(sas_url: str, public_base_url: str = "") -> str:
    if public_base_url and public_base_url.strip():
        return public_base_url.strip().rstrip("/") + "/"
    return build_container_base_url(sas_url)


def build_blob_url(container_base_url: str, blob_path: str) -> str:
    base = container_base_url if container_base_url.endswith("/") else container_base_url + "/"
    return urljoin(base, blob_path)


def extract_version(blob_name: str) -> str:
    slash_index = blob_name.find("/")
    return blob_name[:slash_index] if slash_index > 0 else "latest"


def is_github_generated_source_archive(
    file_name: str,
    repository_name: str,
    release_version_or_tag: str,
) -> bool:
    if not file_name or not repository_name or not release_version_or_tag:
        return False
    normalized_version = release_version_or_tag.strip().lstrip("vV")
    if not normalized_version:
        return False
    lower_name = file_name.lower()
    candidates = {
        f"{repository_name}-{normalized_version}.zip".lower(),
        f"{repository_name}-{normalized_version}.tar.gz".lower(),
    }
    return lower_name in candidates
