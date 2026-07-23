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


class CommandFailed(RuntimeError):
    def __init__(self, command: Sequence[str], exit_code: int) -> None:
        super().__init__(f"command failed ({exit_code}): {' '.join(command)}")
        self.command = command
        self.exit_code = exit_code


class BuildRuntime:
    def __init__(self, repo_root: Path, log_prefix: str = "[PYBUILD]") -> None:
        self.repo_root = repo_root
        self.log_prefix = log_prefix

    def log_stage(self, name: str, state: str) -> None:
        print(f"{self.log_prefix}[stage:{name}] {state}")

    def run_command(self, command: Sequence[str], *, cwd: Path | None = None) -> CommandResult:
        self.log_stage("command", f"start {' '.join(command)}")
        completed = subprocess.run(
            list(command),
            cwd=str(cwd or self.repo_root),
            check=False,
        )
        if completed.returncode != 0:
            self.log_stage("command", f"failed exit={completed.returncode}")
            raise CommandFailed(command, completed.returncode)

        self.log_stage("command", "done")
        return CommandResult(command=command, exit_code=0)


def resolve_python_executable() -> str:
    for candidate in (os.environ.get("PYTHON_EXE"), "python3", "python"):
        if not candidate:
            continue
        resolved = shutil.which(candidate)
        if resolved:
            return resolved

    raise RuntimeError("python executable not found. Install python3 or set PYTHON_EXE.")
