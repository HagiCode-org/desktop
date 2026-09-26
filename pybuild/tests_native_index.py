from __future__ import annotations

import json
import hashlib
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pybuild.native.types import BlobInfo
from pybuild.native.azure_index import (
    build_channels_object,
    build_index_result,
    extract_channel_from_version,
    run_generate_r2_index,
    select_index_retention,
)
from pybuild.native.artifact_metadata import PublishedArtifact, build_artifact_metadata


class IndexTests(unittest.TestCase):
    def test_channel_extraction(self) -> None:
        self.assertEqual(extract_channel_from_version("v1.2.3"), "stable")
        self.assertEqual(extract_channel_from_version("1.2.3-beta.1"), "beta")
        self.assertEqual(extract_channel_from_version("2.0.0-rc.1"), "preview")

    def test_build_index_document_fields_with_and_without_historical_sidecars(self) -> None:
        now = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        blobs = [
            BlobInfo(name="v1.0.0/app-win.exe", size=100, last_modified=now),
            BlobInfo(name="v1.0.0/app-win.exe.torrent", size=10, last_modified=now),
            BlobInfo(name="v1.0.0/app-linux.tar.gz", size=50, last_modified=now),
            BlobInfo(name="v1.0.0-beta.1/app-mac.dmg", size=200, last_modified=now),
            BlobInfo(name="app-unversioned.exe", size=300, last_modified=now),
        ]
        metadata = [
            PublishedArtifact(
                name="app-win.exe",
                local_file_path="/tmp/app-win.exe",
                path="v1.0.0/app-win.exe",
                size=100,
                last_modified=now.isoformat(),
                direct_url="https://desktop.dl.hagicode.com/v1.0.0/app-win.exe",
                sha256="def",
                download_sources=[
                    {
                        "kind": "official",
                        "label": "Official",
                        "url": "https://desktop.dl.hagicode.com/v1.0.0/app-win.exe",
                        "primary": True,
                    }
                ],
            )
        ]
        result = build_index_result(
            blobs,
            "https://account.blob.core.windows.net/container?sv=1",
            metadata,
            public_base_url="https://desktop.dl.hagicode.com",
            github_repository_name="desktop",
        )
        self.assertIsNotNone(result.document)
        assert result.document is not None
        self.assertEqual(result.document["$schema"], "https://desktop.dl.hagicode.com/index.schema.json")
        self.assertIn("updatedAt", result.document)
        self.assertIn("versions", result.document)
        self.assertIn("channels", result.document)
        self.assertEqual(result.version_count, 2)
        self.assertNotIn("latest", result.document["channels"])
        self.assertTrue(
            all(version["version"] != "latest" for version in result.document["versions"])
        )
        win = next(
            asset
            for version in result.document["versions"]
            for asset in version["assets"]
            if asset["name"] == "app-win.exe"
        )
        self.assertEqual(win["sha256"], "def")
        self.assertEqual(win["directUrl"], "https://desktop.dl.hagicode.com/v1.0.0/app-win.exe")
        self.assertNotIn("torrentUrl", win)
        self.assertNotIn("infoHash", win)
        self.assertNotIn("webSeeds", win)
        self.assertNotIn("webSeed", win["downloadSources"][0])
        stable = next(version for version in result.document["versions"] if version["version"] == "v1.0.0")
        linux = next(asset for asset in stable["assets"] if asset["name"] == "app-linux.tar.gz")
        self.assertIn("directUrl", linux)
        self.assertNotIn("sha256", linux)

        channels = build_channels_object(result.document["versions"])
        self.assertIn("stable", channels)
        self.assertIn("beta", channels)

    def test_build_index_result_with_cloudflare_source(self) -> None:
        """Cloudflare base URL 配置时 asset 输出 official + cloudflare 双源。"""
        now = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        blobs = [
            BlobInfo(name="v1.0.0/app-win.exe", size=100, last_modified=now),
        ]
        result = build_index_result(
            blobs,
            "https://account.blob.core.windows.net/container?sv=1",
            public_base_url="https://dl.desktop.hagicode.com",
            cloudflare_public_base_url="https://dl-desktop-cf.hagicode.com",
            github_repository_name="desktop",
        )
        self.assertIsNotNone(result.document)
        assert result.document is not None
        self.assertEqual(result.document["$schema"], "https://dl.desktop.hagicode.com/index.schema.json")
        asset = result.document["versions"][0]["assets"][0]
        self.assertNotIn("downloadUrls", asset)
        sources = asset["downloadSources"]
        kinds = [s["kind"] for s in sources]
        self.assertIn("official", kinds)
        self.assertIn("cloudflare", kinds)
        cf = next(s for s in sources if s["kind"] == "cloudflare")
        self.assertEqual(cf["url"], "https://dl-desktop-cf.hagicode.com/v1.0.0/app-win.exe")
        self.assertNotIn("webSeed", cf)
        self.assertFalse(cf["primary"])
        self.assertNotIn("webSeeds", asset)

    def test_build_index_result_without_cloudflare(self) -> None:
        """未配置 cloudflare base URL 时仅 official 源，无 downloadUrls。"""
        now = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        blobs = [
            BlobInfo(name="v1.0.0/app-win.exe", size=100, last_modified=now),
        ]
        result = build_index_result(
            blobs,
            "https://account.blob.core.windows.net/container?sv=1",
            public_base_url="https://dl.desktop.hagicode.com",
            github_repository_name="desktop",
        )
        self.assertIsNotNone(result.document)
        assert result.document is not None
        asset = result.document["versions"][0]["assets"][0]
        self.assertNotIn("downloadUrls", asset)
        self.assertIn("directUrl", asset)
        sources = asset["downloadSources"]
        kinds = [s["kind"] for s in sources]
        self.assertIn("official", kinds)
        self.assertNotIn("cloudflare", kinds)
        self.assertNotIn("webSeeds", asset)

    def test_r2_retention_prunes_whole_stale_versions_with_or_without_sidecars(self) -> None:
        now = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        blobs = [
            BlobInfo(name="v1.4.0/app.exe", size=1, last_modified=now),
            BlobInfo(name="v1.3.0/app.exe", size=1, last_modified=now),
            BlobInfo(name="v1.2.0/app.exe", size=1, last_modified=now),
            BlobInfo(name="v1.1.0/app.exe", size=1, last_modified=now),
            BlobInfo(name="v1.1.0/app.exe.torrent", size=1, last_modified=now),
            BlobInfo(name="v1.0.0/app.exe", size=1, last_modified=now),
        ]

        retention = select_index_retention(blobs, "v1.4.0")
        result = build_index_result(retention.retained_blobs, "", [], "https://cdn.example")

        self.assertEqual(retention.retained_versions, ["v1.4.0", "v1.3.0", "v1.2.0"])
        self.assertEqual(retention.stale_versions, ["v1.1.0", "v1.0.0"])
        self.assertEqual(
            retention.stale_object_keys,
            ["v1.1.0/app.exe", "v1.1.0/app.exe.torrent", "v1.0.0/app.exe"],
        )
        self.assertIn("v1.2.0/app.exe", [blob.name for blob in retention.retained_blobs])
        self.assertIsNotNone(result.document)
        assert result.document is not None
        self.assertEqual(len(result.document["versions"]), 3)
        channel_versions = result.document["channels"]["stable"]["versions"]
        self.assertNotIn("v1.1.0", channel_versions)

    def test_r2_retention_forces_current_version(self) -> None:
        now = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        blobs = [
            BlobInfo(name="v1.5.0/app.exe", size=1, last_modified=now),
            BlobInfo(name="v1.4.0/app.exe", size=1, last_modified=now),
            BlobInfo(name="v1.3.0/app.exe", size=1, last_modified=now),
            BlobInfo(name="v1.2.0/app.exe", size=1, last_modified=now),
        ]

        retention = select_index_retention(blobs, "v1.2.0")

        self.assertEqual(retention.retained_versions, ["v1.5.0", "v1.4.0", "v1.2.0"])
        self.assertEqual(retention.stale_versions, ["v1.3.0"])

    def test_large_archive_digest_is_associated_without_creating_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "large-release.zip"
            with source.open("wb") as handle:
                handle.truncate(100 * 1024 * 1024 + 1)
                handle.seek(0)
                handle.write(b"large direct archive")
            result = build_artifact_metadata(
                [str(source)],
                "v1.0.0",
                "https://desktop.dl.hagicode.com",
                "HagiCode-org/desktop",
            )
            self.assertEqual(len(result.artifacts), 1)
            artifact = result.artifacts[0]
            self.assertGreater(artifact.size, 100 * 1024 * 1024)
            self.assertEqual(artifact.sha256, hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertEqual(artifact.path, "v1.0.0/large-release.zip")
            self.assertEqual(
                artifact.direct_url,
                "https://desktop.dl.hagicode.com/v1.0.0/large-release.zip",
            )
            self.assertFalse(source.with_name("large-release.zip.torrent").exists())
            self.assertNotIn("torrentUrl", artifact.to_dict())
            self.assertNotIn("infoHash", artifact.to_dict())
            indexed = build_index_result(
                [
                    BlobInfo(
                        name=artifact.path,
                        size=artifact.size,
                        last_modified=datetime.now(tz=timezone.utc),
                    )
                ],
                "",
                result.artifacts,
                public_base_url="https://desktop.dl.hagicode.com",
            )
            assert indexed.document is not None
            indexed_asset = indexed.document["versions"][0]["assets"][0]
            self.assertEqual(indexed_asset["sha256"], artifact.sha256)
            self.assertEqual(indexed_asset["directUrl"], artifact.direct_url)
            self.assertNotIn("torrentUrl", indexed_asset)
            self.assertNotIn("infoHash", indexed_asset)

    def test_generate_r2_index_passes_direct_publish_metadata_once(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "index.json"
            storage = object()
            params = SimpleNamespace(
                effective_github_repository="HagiCode-org/desktop",
                minify_index_json=True,
            )
            index_result = SimpleNamespace(
                index_json="{}",
                document={},
                version_count=1,
                asset_count=1,
                diagnostics=[],
            )
            with (
                patch("pybuild.native.artifacts.resolve_index_output_path", return_value=output_path),
                patch("pybuild.native.azure_index.open_storage_context", return_value=storage),
                patch(
                    "pybuild.native.publish.load_merged_publish_summary",
                    return_value=SimpleNamespace(published_artifacts=[]),
                ),
                patch(
                    "pybuild.native.azure_index.generate_index_from_blobs_with_metadata",
                    return_value=index_result,
                ) as generate_index,
                patch("pybuild.native.azure_index.validate_index_file", return_value=True),
            ):
                self.assertEqual(run_generate_r2_index(Path(tmp), params), 0)

            generate_index.assert_called_once_with(
                storage,
                output_path,
                [],
                minify=True,
                github_repository="HagiCode-org/desktop",
            )


if __name__ == "__main__":
    unittest.main()
