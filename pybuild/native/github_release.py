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


    def _find_release_by_tag(self, tag: str) -> dict | None:
        """Resolve release JSON by tag, including draft releases.

        GitHub's /releases/tags/{tag} endpoint does not return drafts; fall back to
        listing releases and matching tag_name.
        """
        tag = (tag or "").strip()
        if not tag:
            return None
        try:
            raw = self._run_gh("api", f"repos/{self.github_repository}/releases/tags/{tag}")
            document = json.loads(raw)
            if isinstance(document, dict) and document.get("tag_name"):
                return document
        except Exception as error:  # noqa: BLE001
            print(f"[PYBUILD] releases/tags/{tag} unavailable (may be draft): {error}")

        try:
            # Paginate a reasonable window; draft next-version usually near the top.
            # Note: listing drafts requires a token with contents write (or equivalent).
            raw = self._run_gh(
                "api",
                f"repos/{self.github_repository}/releases?per_page=100",
            )
            releases = json.loads(raw)
            if not isinstance(releases, list):
                print(f"[PYBUILD] unexpected releases list type: {type(releases).__name__}")
                return None
            for release in releases:
                if not isinstance(release, dict):
                    continue
                if str(release.get("tag_name") or "") == tag:
                    return release
            draft_tags = [
                str(item.get("tag_name"))
                for item in releases
                if isinstance(item, dict) and item.get("draft")
            ]
            print(
                f"[PYBUILD] tag={tag} not in first {len(releases)} releases "
                f"(drafts visible={len(draft_tags)}: {', '.join(draft_tags[:5]) or 'none'})"
            )
        except Exception as error:  # noqa: BLE001
            print(f"[PYBUILD] failed to list releases for draft lookup: {error}")
        return None


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
            document = self._find_release_by_tag(tag)
            if not document:
                print(f"[PYBUILD] release not found for tag={tag} (including drafts)")
                return []
            if document.get("draft"):
                print(f"[PYBUILD] listing assets from draft release tag={tag}")
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
        release = self._find_release_by_tag(tag)
        if release is None:
            raise RuntimeError(f"release not found for tag={tag} (including drafts)")

        # `gh release download` does not support draft releases (tag or id). Use API.
        if release.get("draft"):
            print(f"[PYBUILD] downloading draft release assets via API tag={tag} id={release.get('id')}")
            self._download_assets_via_api(release, download_directory, asset_names)
            return

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

    def _download_assets_via_api(
        self,
        release: dict,
        download_directory: Path,
        asset_names: Sequence[str] | None = None,
    ) -> None:
        import fnmatch
        import urllib.error
        import urllib.request

        assets = release.get("assets") or []
        if not isinstance(assets, list):
            raise RuntimeError("release assets payload is not a list")

        wanted: set[str] | None = None
        if asset_names:
            wanted = {name for name in asset_names if name}
            print(f"[PYBUILD] downloading shard assets via API: {len(wanted)}")
        else:
            print("[PYBUILD] downloading all release assets via API")

        matched = 0
        for asset in assets:
            if not isinstance(asset, dict):
                continue
            name = str(asset.get("name") or "")
            if not name:
                continue
            if wanted is not None and name not in wanted:
                # also allow simple glob patterns if provided
                if not any(fnmatch.fnmatch(name, pattern) for pattern in wanted):
                    continue
            asset_id = asset.get("id")
            if asset_id is None:
                raise RuntimeError(f"asset missing id: {name}")
            dest = download_directory / name
            url = f"https://api.github.com/repos/{self.github_repository}/releases/assets/{asset_id}"
            print(f"[PYBUILD] API download asset={name} -> {dest}")
            request = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {self.github_token}",
                    "Accept": "application/octet-stream",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "hagicode-desktop-pybuild",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=600) as response:
                    with dest.open("wb") as handle:
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            handle.write(chunk)
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", errors="replace") if hasattr(error, "read") else ""
                raise RuntimeError(
                    f"failed to download asset {name} (HTTP {error.code}): {body[:300]}"
                ) from error
            matched += 1

        if wanted is not None and matched == 0:
            raise RuntimeError(f"no draft assets matched requested names: {sorted(wanted)}")
        if wanted is None and matched == 0:
            raise RuntimeError("draft release has no downloadable assets")
        print(f"[PYBUILD] downloaded {matched} draft asset(s)")

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
