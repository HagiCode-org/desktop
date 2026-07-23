from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from pybuild.native.azure_blob import BlobInfo
from pybuild.native.azure_index import build_channels_object, build_index_result, extract_channel_from_version
from pybuild.native.hybrid_metadata import PublishedArtifact
from pybuild.native.torrent import bencode, generate_torrent_sidecar


class IndexTests(unittest.TestCase):
    def test_channel_extraction(self) -> None:
        self.assertEqual(extract_channel_from_version("v1.2.3"), "stable")
        self.assertEqual(extract_channel_from_version("1.2.3-beta.1"), "beta")
        self.assertEqual(extract_channel_from_version("2.0.0-rc.1"), "preview")

    def test_build_index_document_fields(self) -> None:
        now = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        blobs = [
            BlobInfo(name="v1.0.0/app-win.exe", size=100, last_modified=now),
            BlobInfo(name="v1.0.0/app-win.exe.torrent", size=10, last_modified=now),
            BlobInfo(name="v1.0.0-beta.1/app-mac.dmg", size=200, last_modified=now),
        ]
        metadata = [
            PublishedArtifact(
                name="app-win.exe",
                local_file_path="/tmp/app-win.exe",
                path="v1.0.0/app-win.exe",
                size=100,
                last_modified=now.isoformat(),
                direct_url="https://desktop.dl.hagicode.com/v1.0.0/app-win.exe",
                torrent_path="v1.0.0/app-win.exe.torrent",
                torrent_url="https://desktop.dl.hagicode.com/v1.0.0/app-win.exe.torrent",
                info_hash="abc",
                sha256="def",
                web_seeds=["https://desktop.dl.hagicode.com/v1.0.0/app-win.exe"],
                download_sources=[
                    {
                        "kind": "official",
                        "label": "Official",
                        "url": "https://desktop.dl.hagicode.com/v1.0.0/app-win.exe",
                        "primary": True,
                        "webSeed": True,
                    }
                ],
                meets_threshold=True,
                hybrid_eligible=True,
                legacy_http_fallback=False,
                fallback_reason=None,
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
        self.assertIn("updatedAt", result.document)
        self.assertIn("versions", result.document)
        self.assertIn("channels", result.document)
        self.assertEqual(result.version_count, 2)
        win = next(
            asset
            for version in result.document["versions"]
            for asset in version["assets"]
            if asset["name"] == "app-win.exe"
        )
        self.assertEqual(win["infoHash"], "abc")
        self.assertEqual(win["sha256"], "def")
        self.assertTrue(win["torrentUrl"])

        channels = build_channels_object(result.document["versions"])
        self.assertIn("stable", channels)
        self.assertIn("beta", channels)

    def test_torrent_sidecar_roundtrip_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "payload.bin"
            source.write_bytes(b"hello-world" * 1000)
            sidecar = Path(tmp) / "payload.bin.torrent"
            result = generate_torrent_sidecar(
                source_path=source,
                sidecar_path=sidecar,
                display_name="payload.bin",
                web_seeds=["https://example.com/payload.bin"],
            )
            self.assertTrue(sidecar.is_file())
            self.assertEqual(len(result.info_hash), 40)
            # info dict bencode deterministic
            info = bencode(
                {
                    "length": source.stat().st_size,
                    "name": "payload.bin",
                    "piece length": 1024 * 1024,
                    "pieces": b"",
                }
            )
            self.assertTrue(info.startswith(b"d"))


if __name__ == "__main__":
    unittest.main()
