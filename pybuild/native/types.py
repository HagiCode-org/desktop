"""Shared storage types (BlobInfo, PublishResult)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


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
