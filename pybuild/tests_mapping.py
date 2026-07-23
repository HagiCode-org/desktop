from __future__ import annotations

import unittest

from pybuild.entry import TARGET_ALIASES, parse_build_args
from pybuild.tasks import TARGET_HANDLERS


class TargetMappingTests(unittest.TestCase):
    def test_nuke_target_name_is_accepted(self) -> None:
        parsed = parse_build_args(["--target", "GenerateAzureUploadPlan", "--release-tag", "v1.2.3"])
        self.assertEqual(parsed.target, "GenerateAzureUploadPlan")
        self.assertEqual(parsed.passthrough, ["--release-tag", "v1.2.3"])

    def test_lowercase_target_name_is_normalized(self) -> None:
        parsed = parse_build_args(["--target", "generateazureindex"])
        self.assertEqual(parsed.target, "GenerateAzureIndex")

    def test_target_equals_syntax_is_supported(self) -> None:
        parsed = parse_build_args(["--target=PublishToAzureBlob", "--upload-index", "false"])
        self.assertEqual(parsed.target, "PublishToAzureBlob")
        self.assertEqual(parsed.passthrough, ["--upload-index", "false"])

    def test_default_target_used_when_missing(self) -> None:
        parsed = parse_build_args(["--release-tag", "v1.0.0"])
        self.assertEqual(parsed.target, "Default")
        self.assertEqual(parsed.passthrough, ["--release-tag", "v1.0.0"])

    def test_all_aliases_have_handlers(self) -> None:
        normalized_targets = set(TARGET_ALIASES.values())
        self.assertEqual(normalized_targets, set(TARGET_HANDLERS.keys()))


if __name__ == "__main__":
    unittest.main()
