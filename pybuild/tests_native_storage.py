from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from pybuild.native.azure_blob import BlobInfo, PublishResult
from pybuild.native.params import BuildParams, parse_passthrough
from pybuild.native.storage_publish import (
    StorageContext,
    open_storage_context,
    require_storage_credentials,
    resolve_provider,
    upload_artifacts,
    upload_index,
    list_objects,
)


class StorageProviderTests(unittest.TestCase):
    def test_resolve_provider_default_r2(self) -> None:
        params = BuildParams()
        with patch.dict(os.environ, {}, clear=False):
            # Clear provider env if present
            env = {
                k: v
                for k, v in os.environ.items()
                if k not in {"STORAGE_PROVIDER", "HAGICODE_STORAGE_PROVIDER"}
            }
            with patch.dict(os.environ, env, clear=True):
                params = BuildParams()
                self.assertEqual(resolve_provider(params), "r2")

    def test_resolve_provider_cli_over_env(self) -> None:
        with patch.dict(
            os.environ,
            {"STORAGE_PROVIDER": "r2"},
            clear=False,
        ):
            params = parse_passthrough(["--storage-provider", "azure"])
            self.assertEqual(resolve_provider(params), "azure")

    def test_resolve_provider_env(self) -> None:
        with patch.dict(os.environ, {"STORAGE_PROVIDER": "azure"}, clear=False):
            params = parse_passthrough([])
            self.assertEqual(resolve_provider(params), "azure")

    def test_resolve_provider_invalid(self) -> None:
        params = BuildParams(storage_provider="gcs")
        with self.assertRaises(ValueError):
            resolve_provider(params)

    def test_require_credentials_r2_missing(self) -> None:
        params = BuildParams(storage_provider="r2")
        with patch.dict(os.environ, {}, clear=False):
            env = {
                k: v
                for k, v in os.environ.items()
                if not k.startswith("R2_") and k not in {"STORAGE_PROVIDER", "HAGICODE_STORAGE_PROVIDER"}
            }
            with patch.dict(os.environ, env, clear=True):
                params = BuildParams(storage_provider="r2")
                with self.assertRaises(ValueError) as ctx:
                    require_storage_credentials(params)
                self.assertIn("R2", str(ctx.exception))

    def test_require_credentials_azure_missing(self) -> None:
        params = BuildParams(storage_provider="azure")
        with patch.dict(os.environ, {}, clear=False):
            env = {
                k: v
                for k, v in os.environ.items()
                if k not in {"AZURE_BLOB_SAS_URL", "AzureBlobSasUrl", "STORAGE_PROVIDER"}
            }
            with patch.dict(os.environ, env, clear=True):
                params = BuildParams(storage_provider="azure")
                with self.assertRaises(ValueError) as ctx:
                    require_storage_credentials(params)
                self.assertIn("Azure", str(ctx.exception))

    def test_require_credentials_r2_ok(self) -> None:
        params = BuildParams(
            storage_provider="r2",
            r2_endpoint="https://example.r2.cloudflarestorage.com",
            r2_bucket="desktop",
            r2_access_key="ak",
            r2_secret_key="sk",
        )
        self.assertEqual(require_storage_credentials(params), "r2")

    def test_require_credentials_azure_ok(self) -> None:
        params = BuildParams(
            storage_provider="azure",
            azure_blob_sas_url="https://account.blob.core.windows.net/c?sv=1",
        )
        self.assertEqual(require_storage_credentials(params), "azure")

    def test_parse_passthrough_r2_flags(self) -> None:
        params = parse_passthrough(
            [
                "--storage-provider=r2",
                "--r2-endpoint",
                "https://ep",
                "--r2-bucket",
                "b",
                "--r2-access-key",
                "ak",
                "--r2-secret-key",
                "sk",
                "--r2-public-base-url",
                "https://cdn.example",
            ]
        )
        self.assertEqual(params.storage_provider, "r2")
        self.assertEqual(params.r2_endpoint, "https://ep")
        self.assertEqual(params.r2_bucket, "b")
        self.assertEqual(params.r2_access_key, "ak")
        self.assertEqual(params.r2_secret_key, "sk")
        self.assertEqual(params.r2_public_base_url, "https://cdn.example")

    def test_upload_artifacts_r2_mocked(self) -> None:
        client = MagicMock()
        client.bucket = "desktop"
        client.object_public_uri.side_effect = lambda key: f"https://cdn/{key}"
        client.head_object.return_value = None

        def _upload(key, path, retries=3):
            return None

        client.upload_file.side_effect = _upload
        storage = StorageContext(
            provider="r2",
            public_base_url="https://cdn",
            version_prefix="v1.0.0",
            r2_client=client,
        )
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "app.bin"
            f.write_bytes(b"data")
            with patch("pybuild.native.r2_blob.should_skip_upload", return_value=False):
                result = upload_artifacts([str(f)], storage)
        self.assertTrue(result.success)
        self.assertEqual(result.uploaded_blob_names, ["v1.0.0/app.bin"])
        client.upload_file.assert_called()

    def test_list_and_index_r2_mocked(self) -> None:
        client = MagicMock()
        client.bucket = "desktop"
        client.list_objects.return_value = [
            BlobInfo(name="v1/a.bin", size=1, last_modified=datetime.now(timezone.utc))
        ]
        client.object_public_uri.return_value = "https://cdn/index.json"
        storage = StorageContext(
            provider="r2",
            public_base_url="https://cdn",
            r2_client=client,
        )
        blobs = list_objects(storage)
        self.assertEqual(len(blobs), 1)
        self.assertTrue(upload_index(storage, '{"ok":true}'))
        client.upload_bytes.assert_called()

    def test_azure_path_open_context(self) -> None:
        params = BuildParams(
            storage_provider="azure",
            azure_blob_sas_url="https://account.blob.core.windows.net/container?sv=1",
            azure_public_base_url="https://desktop.dl.hagicode.com",
        )
        with patch("pybuild.native.storage_publish.AzureBlobClient") as mock_cls:
            instance = mock_cls.return_value
            instance.validate.return_value = True
            ctx = open_storage_context(params, version_prefix="v1")
        self.assertEqual(ctx.provider, "azure")
        self.assertEqual(ctx.public_base_url, "https://desktop.dl.hagicode.com")
        mock_cls.assert_called_once()


if __name__ == "__main__":
    unittest.main()
