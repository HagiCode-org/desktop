from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


@dataclass
class CommandResult:
    command: Sequence[str]
    exit_code: int
    stdout: str = ""
    stderr: str = ""


class CommandFailed(RuntimeError):
    def __init__(self, command: Sequence[str], exit_code: int, stderr: str = "") -> None:
        detail = f"command failed ({exit_code}): {' '.join(command)}"
        if stderr:
            detail = f"{detail}\n{stderr}"
        super().__init__(detail)
        self.command = command
        self.exit_code = exit_code
        self.stderr = stderr


class BuildRuntime:
    def __init__(self, repo_root: Path, log_prefix: str = "[PYBUILD]") -> None:
        self.repo_root = repo_root
        self.log_prefix = log_prefix

    def log(self, message: str) -> None:
        print(f"{self.log_prefix} {message}")

    def log_stage(self, name: str, state: str) -> None:
        print(f"{self.log_prefix}[stage:{name}] {state}")

    def run_command(
        self,
        command: Sequence[str],
        *,
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
        capture: bool = False,
    ) -> CommandResult:
        self.log_stage("command", f"start {' '.join(command)}")
        merged_env = os.environ.copy()
        if env:
            merged_env.update(env)

        completed = subprocess.run(
            list(command),
            cwd=str(cwd or self.repo_root),
            env=merged_env,
            check=False,
            capture_output=capture,
            text=True if capture else None,
        )
        if completed.returncode != 0:
            stderr = completed.stderr if capture else ""
            self.log_stage("command", f"failed exit={completed.returncode}")
            raise CommandFailed(command, completed.returncode, stderr=stderr or "")

        self.log_stage("command", "done")
        return CommandResult(
            command=command,
            exit_code=0,
            stdout=completed.stdout if capture else "",
            stderr=completed.stderr if capture else "",
        )


def resolve_python_executable() -> str:
    for candidate in (os.environ.get("PYTHON_EXE"), "python3", "python"):
        if not candidate:
            continue
        resolved = shutil.which(candidate)
        if resolved:
            return resolved

    raise RuntimeError("python executable not found. Install python3 or set PYTHON_EXE.")
