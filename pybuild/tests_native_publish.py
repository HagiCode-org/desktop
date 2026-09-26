from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pybuild.native.types import PublishResult
from pybuild.native.artifact_metadata import PublishedArtifact
from pybuild.native.publish import (
    ReleasePublishSummary,
    apply_retention_cleanup,
    merge_publish_results,
    orchestrate_publish,
    run_publish_to_r2,
)
from pybuild.native.azure_index import IndexGenerationResult
from pybuild.native.params import BuildParams
from pybuild.native.types import BlobInfo
from pybuild.native.storage_publish import StorageContext


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
                        "uploadedBlobCount": 1,
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
                                "sha256": "legacy-digest",
                                "torrentUrl": "https://example/b.dmg.torrent",
                                "infoHash": "legacy-info-hash",
                                "downloadSources": [
                                    {
                                        "kind": "official",
                                        "url": "u",
                                        "webSeed": True,
                                    }
                                ],
                            }
                        ],
                        "diagnostics": [],
                        "uploadedBlobNames": ["v1/b.dmg"],
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
            self.assertEqual(len(merged.published_artifacts), 2)
            summary = merged.to_dict()
            self.assertEqual(summary["publishedArchiveCount"], 2)
            self.assertNotIn("sidecarSuccessCount", summary)
            self.assertNotIn("httpOnlyFallbackCount", summary)
            legacy_artifact = summary["publishedArtifacts"][1]
            self.assertEqual(legacy_artifact["sha256"], "legacy-digest")
            self.assertNotIn("torrentUrl", legacy_artifact)
            self.assertNotIn("infoHash", legacy_artifact)
            self.assertNotIn("webSeed", legacy_artifact["downloadSources"][0])

    def test_orchestrate_publish_upload_only(self) -> None:
        from pybuild.native.storage_publish import StorageContext

        with tempfile.TemporaryDirectory() as tmp:
            payload = Path(tmp) / "small.bin"
            payload.write_bytes(b"x" * 10)
            version_prefix = "v1.0.0"
            storage = StorageContext(
                public_base_url="https://desktop.dl.hagicode.com",
                version_prefix=version_prefix,
            )
            fake_result = PublishResult(
                success=True,
                uploaded_blob_names=["v1.0.0/small.bin"],
                uploaded_blobs=["https://example/v1.0.0/small.bin"],
            )
            with patch(
                "pybuild.native.publish.storage_upload_artifacts",
                return_value=fake_result,
            ):
                summary = orchestrate_publish(
                    [str(payload)],
                    storage,
                    upload_index=False,
                    minify_index_json=True,
                    github_repository="HagiCode-org/desktop",
                )
            self.assertTrue(summary.success)
            self.assertEqual(summary.uploaded_blob_count, 1)
            self.assertEqual(len(summary.published_artifacts), 1)
            self.assertEqual(summary.published_archive_count, 1)

    def test_large_archive_publish_is_direct_only_and_retains_digest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "HagiCode-1.0.0-win.exe"
            with archive.open("wb") as handle:
                handle.truncate(100 * 1024 * 1024 + 1)
                handle.seek(0)
                handle.write(b"direct archive bytes")
            sidecar = Path(f"{archive}.torrent")
            sidecar.write_bytes(b"historical sidecar must not be republished")
            storage = StorageContext(
                public_base_url="https://desktop.dl.hagicode.com",
                version_prefix="v1.0.0",
            )
            fake_result = PublishResult(
                success=True,
                uploaded_blob_names=["v1.0.0/HagiCode-1.0.0-win.exe"],
                uploaded_blobs=["https://desktop.dl.hagicode.com/v1.0.0/HagiCode-1.0.0-win.exe"],
            )
            with patch(
                "pybuild.native.publish.storage_upload_artifacts",
                return_value=fake_result,
            ) as upload:
                summary = orchestrate_publish(
                    [str(archive), str(sidecar)],
                    storage,
                    upload_index=False,
                    minify_index_json=True,
                    github_repository="HagiCode-org/desktop",
                )

            upload.assert_called_once_with([str(archive)], storage)
            self.assertTrue(summary.success)
            self.assertEqual(summary.published_archive_count, 1)
            artifact = summary.published_artifacts[0]
            self.assertGreater(artifact.size, 100 * 1024 * 1024)
            self.assertEqual(
                artifact.sha256,
                hashlib.sha256(archive.read_bytes()).hexdigest(),
            )
            self.assertNotIn("torrentUrl", artifact.to_dict())
            self.assertNotIn("infoHash", artifact.to_dict())
            self.assertTrue(sidecar.exists())
            self.assertNotIn("sidecarSuccessCount", summary.to_dict())

    def test_orchestrate_publish_filters_disabled_release_assets(self) -> None:
        from pybuild.native.storage_publish import StorageContext

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            enabled = root / "HagiCode-1.0.0-win.exe"
            signed = root / "HagiCode-1.0.0-win-signed.exe"
            zip_file = root / "HagiCode-1.0.0-win.zip"
            linux_tar = root / "HagiCode-1.0.0-linux.tar.gz"
            for item in (enabled, signed, zip_file, linux_tar):
                item.write_bytes(b"x" * 10)
            version_prefix = "v1.0.0"
            storage = StorageContext(
                public_base_url="https://desktop.dl.hagicode.com",
                version_prefix=version_prefix,
            )
            fake_result = PublishResult(
                success=True,
                uploaded_blob_names=["v1.0.0/HagiCode-1.0.0-win.exe"],
                uploaded_blobs=["https://example/v1.0.0/HagiCode-1.0.0-win.exe"],
            )
            with patch("pybuild.native.publish.storage_upload_artifacts", return_value=fake_result) as upload:
                summary = orchestrate_publish(
                    [str(enabled), str(signed), str(zip_file), str(linux_tar)],
                    storage,
                    upload_index=False,
                    minify_index_json=True,
                    github_repository="HagiCode-org/desktop",
                )

            upload.assert_called_once_with([str(enabled)], storage)
            self.assertTrue(summary.success)
            self.assertEqual([artifact.name for artifact in summary.published_artifacts], [enabled.name])


    def test_apply_retention_cleanup_reports_failed_keys(self) -> None:
        from pybuild.native.azure_index import IndexGenerationResult, IndexRetentionResult
        from pybuild.native.storage_publish import StorageContext

        summary = ReleasePublishSummary()
        storage = StorageContext(public_base_url="https://cdn")
        index_result = IndexGenerationResult(
            retention=IndexRetentionResult(stale_object_keys=["v1.0.0/app.bin"])
        )
        delete_result = PublishResult(success=False, failed_blob_names=["v1.0.0/app.bin"])
        with patch("pybuild.native.publish.storage_delete_objects", return_value=delete_result):
            ok = apply_retention_cleanup(summary, storage, index_result)

        self.assertFalse(ok)
        self.assertEqual(summary.stale_delete_failed_blob_names, ["v1.0.0/app.bin"])
        self.assertEqual(summary.diagnostics[0]["code"], "stale-delete-failed")

    def test_finalize_index_uses_storage_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output_path = root / "r2-index.json"
            params = BuildParams(
                upload_artifacts=False,
                upload_index=True,
                release_tag="v1.0.0",
                release_version="v1.0.0",
                azure_index_output_path=str(output_path),
            )
            storage = StorageContext(
                public_base_url="https://desktop.dl.hagicode.com",
                version_prefix="v1.0.0",
            )
            index_result = IndexGenerationResult(index_json='{"versions":[]}')

            with (
                patch("pybuild.native.publish.open_storage_context", return_value=storage),
                patch(
                    "pybuild.native.publish.generate_index_from_blobs_with_metadata",
                    return_value=index_result,
                ) as generate_index,
                patch("pybuild.native.publish.storage_upload_index", return_value=True),
            ):
                self.assertEqual(run_publish_to_r2(root, params), 0)

            generate_index.assert_called_once_with(
                storage,
                output_path,
                [],
                minify=True,
                github_repository="HagiCode-org/desktop",
            )

if __name__ == "__main__":
    unittest.main()
