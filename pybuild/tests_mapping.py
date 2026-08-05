from __future__ import annotations

import unittest

from pybuild.entry import TARGET_ALIASES, parse_build_args
from pybuild.tasks import TARGET_HANDLERS


class TargetMappingTests(unittest.TestCase):
    def test_canonical_target_name_is_accepted(self) -> None:
        parsed = parse_build_args(["--target", "GenerateR2UploadPlan", "--release-tag", "v1.2.3"])
        self.assertEqual(parsed.target, "GenerateR2UploadPlan")
        self.assertEqual(parsed.passthrough, ["--release-tag", "v1.2.3"])

    def test_lowercase_target_name_is_normalized(self) -> None:
        parsed = parse_build_args(["--target", "generater2index"])
        self.assertEqual(parsed.target, "GenerateR2Index")

    def test_target_equals_syntax_is_supported(self) -> None:
        parsed = parse_build_args(["--target=PublishToR2", "--upload-index", "false"])
        self.assertEqual(parsed.target, "PublishToR2")
        self.assertEqual(parsed.passthrough, ["--upload-index", "false"])

    def test_default_target_used_when_missing(self) -> None:
        parsed = parse_build_args(["--release-tag", "v1.0.0"])
        self.assertEqual(parsed.target, "Default")
        self.assertEqual(parsed.passthrough, ["--release-tag", "v1.0.0"])

    def test_legacy_azure_target_name_resolves_to_r2(self) -> None:
        parsed = parse_build_args(["--target", "PublishToAzureBlob"])
        self.assertEqual(parsed.target, "PublishToR2")

    def test_all_aliases_have_handlers(self) -> None:
        normalized_targets = set(TARGET_ALIASES.values())
        self.assertEqual(normalized_targets, set(TARGET_HANDLERS.keys()))


if __name__ == "__main__":
    unittest.main()
