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


def _command_needs_shell(command: Sequence[str]) -> bool:
    # On Windows, wrapper executables shipped as .cmd/.bat/.ps1 (e.g. npm, npx,
    # yarn) cannot be launched directly via CreateProcess. They must run through
    # the shell (cmd.exe /c). Real executables (.exe) do not need this.
    if os.name != "nt" or not command:
        return False
    resolved = shutil.which(str(command[0]))
    if not resolved:
        return False
    return resolved.lower().endswith((".cmd", ".bat", ".ps1"))


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

        # .cmd/.bat/.ps1 wrappers on Windows must run through cmd.exe; pass the
        # command as a single joined line so quoting is handled consistently.
        use_shell = _command_needs_shell(command)
        program: str | list[str] = subprocess.list2cmdline(list(command)) if use_shell else list(command)

        completed = subprocess.run(
            program,
            cwd=str(cwd or self.repo_root),
            env=merged_env,
            check=False,
            capture_output=capture,
            text=True if capture else None,
            shell=use_shell,
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