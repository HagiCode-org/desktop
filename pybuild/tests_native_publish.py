from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pybuild.native.azure_blob import PublishResult
from pybuild.native.hybrid_metadata import PublishedArtifact
from pybuild.native.publish import (
    ReleasePublishSummary,
    merge_publish_results,
    orchestrate_publish,
)
from pybuild.native.azure_blob import AzureBlobPublishOptions


class PublishTests(unittest.TestCase):
    def test_merge_publish_results(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a.json"
            b = root / "b.json"
            a.write_text(
                json.dumps(
                    {
                        "shardId": "shard-001",
                        "success": True,
                        "eligibleAssetCount": 1,
                        "sidecarSuccessCount": 0,
                        "httpOnlyFallbackCount": 1,
                        "uploadedBlobCount": 1,
                        "skippedBlobCount": 0,
                        "missingBlobCount": 0,
                        "publishedArtifacts": [
                            {
                                "name": "a.exe",
                                "localFilePath": "/tmp/a.exe",
                                "path": "v1/a.exe",
                                "size": 1,
                                "lastModified": "t",
                                "directUrl": "u",
                            }
                        ],
                        "diagnostics": [],
                        "uploadedBlobNames": ["v1/a.exe"],
                        "skippedBlobNames": [],
                        "missingBlobNames": [],
                    }
                ),
                encoding="utf-8",
            )
            b.write_text(
                json.dumps(
                    {
                        "shardId": "shard-002",
                        "success": True,
                        "eligibleAssetCount": 1,
                        "sidecarSuccessCount": 1,
                        "httpOnlyFallbackCount": 0,
                        "uploadedBlobCount": 2,
                        "skippedBlobCount": 0,
                        "missingBlobCount": 0,
                        "publishedArtifacts": [
                            {
                                "name": "b.dmg",
                                "localFilePath": "/tmp/b.dmg",
                                "path": "v1/b.dmg",
                                "size": 2,
                                "lastModified": "t",
                                "directUrl": "u",
                            }
                        ],
                        "diagnostics": [],
                        "uploadedBlobNames": ["v1/b.dmg", "v1/b.dmg.torrent"],
                        "skippedBlobNames": [],
                        "missingBlobNames": [],
                    }
                ),
                encoding="utf-8",
            )
            merged = merge_publish_results(
                {
                    "expectedShardIds": ["shard-001", "shard-002"],
                    "resultFiles": [str(a), str(b)],
                }
            )
            self.assertTrue(merged.success)
            self.assertEqual(merged.shard_id, "finalize")
            self.assertEqual(merged.eligible_asset_count, 2)
            self.assertEqual(len(merged.published_artifacts), 2)

    def test_orchestrate_publish_upload_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            payload = Path(tmp) / "small.bin"
            payload.write_bytes(b"x" * 10)
            options = AzureBlobPublishOptions(
                sas_url="https://account.blob.core.windows.net/container?sv=1",
                version_prefix="v1.0.0",
                public_base_url="https://desktop.dl.hagicode.com",
                local_index_path=str(Path(tmp) / "index.json"),
            )

            fake_result = PublishResult(
                success=True,
                uploaded_blob_names=["v1.0.0/small.bin"],
                uploaded_blobs=["https://example/v1.0.0/small.bin"],
            )

            with patch("pybuild.native.publish.upload_artifacts", return_value=fake_result):
                summary = orchestrate_publish(
                    [str(payload)],
                    options,
                    upload_index=False,
                    minify_index_json=True,
                    github_repository="HagiCode-org/desktop",
                )
            self.assertTrue(summary.success)
            self.assertEqual(summary.uploaded_blob_count, 1)
            self.assertEqual(len(summary.published_artifacts), 1)
            self.assertTrue(summary.published_artifacts[0].legacy_http_fallback)


if __name__ == "__main__":
    unittest.main()
