from __future__ import annotations

from pathlib import Path
from typing import Callable, Iterable

from invoke import Collection, task

from .runtime import BuildRuntime

REPO_ROOT = Path(__file__).resolve().parents[1]
RUNTIME = BuildRuntime(repo_root=REPO_ROOT)


def _nuke_target_command(target_name: str, passthrough: Iterable[str]) -> list[str]:
    command = [
        "dotnet",
        "run",
        "--project",
        "nukeBuild/_build.csproj",
        "--target",
        target_name,
    ]
    command.extend(passthrough)
    return command


def _invoke_nuke_target(target_name: str, passthrough: Iterable[str]) -> int:
    command = _nuke_target_command(target_name, passthrough)
    RUNTIME.log_stage(target_name, "start")
    RUNTIME.run_command(command, cwd=REPO_ROOT)
    RUNTIME.log_stage(target_name, "done")
    return 0


def _run_setup(_: Iterable[str]) -> int:
    RUNTIME.log_stage("Setup", "start")
    print("[PYBUILD] setup completed")
    RUNTIME.log_stage("Setup", "done")
    return 0


def _run_generate_azure_upload_plan(passthrough: Iterable[str]) -> int:
    return _invoke_nuke_target("GenerateAzureUploadPlan", passthrough)


def _run_generate_azure_index(passthrough: Iterable[str]) -> int:
    return _invoke_nuke_target("GenerateAzureIndex", passthrough)


def _run_publish_to_azure_blob(passthrough: Iterable[str]) -> int:
    return _invoke_nuke_target("PublishToAzureBlob", passthrough)


def _run_default(passthrough: Iterable[str]) -> int:
    return _invoke_nuke_target("Default", passthrough)


TARGET_HANDLERS: dict[str, Callable[[Iterable[str]], int]] = {
    "Setup": _run_setup,
    "GenerateAzureUploadPlan": _run_generate_azure_upload_plan,
    "GenerateAzureIndex": _run_generate_azure_index,
    "PublishToAzureBlob": _run_publish_to_azure_blob,
    "Default": _run_default,
}


def run_named_target(target_name: str, passthrough: Iterable[str]) -> int:
    handler = TARGET_HANDLERS.get(target_name)
    if handler is None:
        raise ValueError(f"unsupported target: {target_name}")
    return handler(list(passthrough))


@task(name="setup")
def setup_task(c, passthrough: str = ""):
    del c
    args = [arg for arg in passthrough.split(" ") if arg]
    return _run_setup(args)


@task(name="generate-azure-upload-plan")
def generate_azure_upload_plan_task(c, passthrough: str = ""):
    del c
    args = [arg for arg in passthrough.split(" ") if arg]
    return _run_generate_azure_upload_plan(args)


@task(name="generate-azure-index")
def generate_azure_index_task(c, passthrough: str = ""):
    del c
    args = [arg for arg in passthrough.split(" ") if arg]
    return _run_generate_azure_index(args)


@task(name="publish-to-azure-blob")
def publish_to_azure_blob_task(c, passthrough: str = ""):
    del c
    args = [arg for arg in passthrough.split(" ") if arg]
    return _run_publish_to_azure_blob(args)


@task(name="default")
def default_task(c, passthrough: str = ""):
    del c
    args = [arg for arg in passthrough.split(" ") if arg]
    return _run_default(args)


ns = Collection()
ns.add_task(setup_task)
ns.add_task(generate_azure_upload_plan_task)
ns.add_task(generate_azure_index_task)
ns.add_task(publish_to_azure_blob_task)
ns.add_task(default_task)
