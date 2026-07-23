from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .params import normalize_github_repository, resolve_github_repository_name
from .path_utils import is_github_generated_source_archive


@dataclass
class GitHubReleaseAsset:
    name: str
    size: int


class GitHubReleaseClient:
    def __init__(
        self,
        repo_root: Path,
        github_token: str,
        github_repository: str,
    ) -> None:
        self.repo_root = repo_root
        self.github_token = github_token
        self.github_repository = normalize_github_repository(github_repository)
        self.github_repository_name = resolve_github_repository_name(self.github_repository)

    def get_latest_release_tag(self) -> str | None:
        try:
            output = self._run_gh(
                "release",
                "view",
                "--repo",
                self.github_repository,
                "--json",
                "tagName",
                "--jq",
                ".tagName",
            )
            tag = output.strip()
            return tag or None
        except Exception as error:  # noqa: BLE001
            print(f"[PYBUILD] failed to resolve latest release tag: {error}")
            return None

    def get_release_assets(self, tag: str) -> list[GitHubReleaseAsset]:
        try:
            raw = self._run_gh("api", f"repos/{self.github_repository}/releases/tags/{tag}")
            document = json.loads(raw)
            assets_element = document.get("assets")
            if not isinstance(assets_element, list):
                return []
            assets: list[GitHubReleaseAsset] = []
            for asset in assets_element:
                name = asset.get("name")
                if not name:
                    continue
                size = asset.get("size") or 0
                assets.append(GitHubReleaseAsset(name=str(name), size=int(size)))
            return assets
        except Exception as error:  # noqa: BLE001
            print(f"[PYBUILD] failed to list release assets: {error}")
            return []

    def download_release_assets(
        self,
        tag: str,
        download_directory: Path,
        asset_names: Sequence[str] | None = None,
    ) -> None:
        download_directory.mkdir(parents=True, exist_ok=True)
        arguments = [
            "release",
            "download",
            tag,
            "--repo",
            self.github_repository,
            "--dir",
            str(download_directory),
            "--clobber",
        ]
        if asset_names:
            for asset_name in sorted({name for name in asset_names if name}, key=str.lower):
                arguments.extend(["--pattern", asset_name])
            print(f"[PYBUILD] downloading shard assets: {len(list(asset_names))}")
        else:
            print("[PYBUILD] downloading all release assets")
        self._run_gh(*arguments)

    def is_source_archive(self, asset_name: str, tag: str, version_prefix: str) -> bool:
        return is_github_generated_source_archive(
            asset_name, self.github_repository_name, tag
        ) or is_github_generated_source_archive(
            asset_name, self.github_repository_name, version_prefix
        )

    def _run_gh(self, *arguments: str) -> str:
        if shutil.which("gh") is None:
            raise RuntimeError("gh CLI not found on PATH")

        env = os.environ.copy()
        if self.github_token:
            env["GH_TOKEN"] = self.github_token

        completed = subprocess.run(
            ["gh", *arguments],
            cwd=str(self.repo_root),
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            error = (completed.stderr or completed.stdout or "").strip()
            raise RuntimeError(f"gh {' '.join(arguments)} failed ({completed.returncode}): {error}")
        if completed.stderr and completed.stderr.strip():
            print(f"[PYBUILD] gh stderr: {completed.stderr.strip()}")
        return completed.stdout or ""
