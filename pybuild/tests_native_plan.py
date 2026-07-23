from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from pybuild.native.github_release import GitHubReleaseAsset, GitHubReleaseClient
from pybuild.native.params import parse_passthrough
from pybuild.native.path_utils import is_github_generated_source_archive
from pybuild.native.upload_plan import build_matrix_document, create_upload_plan


class ParamsTests(unittest.TestCase):
    def test_parse_name_value_and_equals(self) -> None:
        params = parse_passthrough(
            [
                "--ReleaseTag",
                "v1.2.3",
                "--release-channel=beta",
                "--AzureMaxParallel",
                "5",
                "--upload-index",
                "false",
                "--unknown-flag",
                "x",
            ]
        )
        self.assertEqual(params.release_tag, "v1.2.3")
        self.assertEqual(params.release_channel, "beta")
        self.assertEqual(params.azure_max_parallel, 5)
        self.assertFalse(params.upload_index)
        self.assertIn("--unknown-flag", params.unrecognized)

    def test_source_archive_filter(self) -> None:
        self.assertTrue(
            is_github_generated_source_archive("desktop-1.2.3.zip", "desktop", "v1.2.3")
        )
        self.assertTrue(
            is_github_generated_source_archive("desktop-1.2.3.tar.gz", "desktop", "1.2.3")
        )
        self.assertFalse(
            is_github_generated_source_archive("HagiCode-1.2.3-win.exe", "desktop", "v1.2.3")
        )


class UploadPlanTests(unittest.TestCase):
    def test_plan_and_matrix_shape(self) -> None:
        client = MagicMock(spec=GitHubReleaseClient)
        client.github_repository = "HagiCode-org/desktop"
        client.get_release_assets.return_value = [
            GitHubReleaseAsset(name="desktop-1.0.0.zip", size=10),
            GitHubReleaseAsset(name="app-win.exe", size=100),
            GitHubReleaseAsset(name="app-mac.dmg", size=200),
        ]
        client.is_source_archive.side_effect = (
            lambda name, tag, version: name.startswith("desktop-") and name.endswith(".zip")
        )

        plan = create_upload_plan(
            tag="v1.0.0",
            version_prefix="v1.0.0",
            release_channel="beta",
            max_parallel=3,
            client=client,
        )
        self.assertEqual(plan["releaseTag"] if "releaseTag" in plan else plan["release_tag"], plan.get("release_tag", "v1.0.0"))
        self.assertEqual(plan["release_tag"], "v1.0.0")
        self.assertEqual(plan["version_prefix"], "v1.0.0")
        self.assertEqual(len(plan["eligible_assets"]), 2)
        self.assertEqual(plan["skipped_assets"], ["desktop-1.0.0.zip"])
        self.assertEqual(len(plan["shards"]), 2)
        self.assertEqual(plan["shards"][0]["shard_id"], "shard-001")
        self.assertEqual(plan["max_parallel"], 3)

        matrix = build_matrix_document(plan)
        self.assertIn("shard", matrix)
        self.assertEqual(len(matrix["shard"]), 2)
        self.assertEqual(matrix["shard"][0]["asset_count"], 1)
        self.assertTrue(matrix["shard"][0]["asset_name"])

        with tempfile.TemporaryDirectory() as tmp:
            from pybuild.native.artifacts import write_camel_json

            plan_path = Path(tmp) / "plan.json"
            matrix_path = Path(tmp) / "matrix.json"
            write_camel_json(plan_path, plan)
            write_camel_json(matrix_path, matrix)
            loaded_plan = json.loads(plan_path.read_text(encoding="utf-8"))
            loaded_matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
            self.assertEqual(loaded_plan["releaseTag"], "v1.0.0")
            self.assertEqual(loaded_plan["versionPrefix"], "v1.0.0")
            self.assertEqual(loaded_plan["eligibleAssets"][0]["name"], "app-mac.dmg")
            self.assertEqual(loaded_matrix["shard"][0]["shardId"], "shard-001")


if __name__ == "__main__":
    unittest.main()
