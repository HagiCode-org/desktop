from __future__ import annotations

from pathlib import Path
from typing import Callable, Iterable

from invoke import Collection, task

from .native.azure_index import run_generate_azure_index
from .native.params import parse_passthrough
from .native.publish import run_publish_to_azure_blob
from .native.upload_plan import run_generate_azure_upload_plan
from .runtime import BuildRuntime

REPO_ROOT = Path(__file__).resolve().parents[1]
RUNTIME = BuildRuntime(repo_root=REPO_ROOT)


def _warn_unrecognized(params) -> None:
    if params.unrecognized:
        joined = " ".join(params.unrecognized)
        RUNTIME.log(f"unrecognized passthrough (ignored): {joined}")


def _run_setup(passthrough: Iterable[str]) -> int:
    params = parse_passthrough(passthrough)
    _warn_unrecognized(params)
    RUNTIME.log_stage("Setup", "start")
    print("[PYBUILD] setup completed")
    RUNTIME.log_stage("Setup", "done")
    return 0


def _run_generate_azure_upload_plan(passthrough: Iterable[str]) -> int:
    params = parse_passthrough(passthrough)
    _warn_unrecognized(params)
    RUNTIME.log_stage("GenerateAzureUploadPlan", "start")
    try:
        return run_generate_azure_upload_plan(REPO_ROOT, params)
    finally:
        RUNTIME.log_stage("GenerateAzureUploadPlan", "done")


def _run_generate_azure_index(passthrough: Iterable[str]) -> int:
    params = parse_passthrough(passthrough)
    _warn_unrecognized(params)
    RUNTIME.log_stage("GenerateAzureIndex", "start")
    try:
        return run_generate_azure_index(REPO_ROOT, params)
    finally:
        RUNTIME.log_stage("GenerateAzureIndex", "done")


def _run_publish_to_azure_blob(passthrough: Iterable[str]) -> int:
    params = parse_passthrough(passthrough)
    _warn_unrecognized(params)
    RUNTIME.log_stage("PublishToAzureBlob", "start")
    try:
        return run_publish_to_azure_blob(REPO_ROOT, params)
    finally:
        RUNTIME.log_stage("PublishToAzureBlob", "done")


def _run_default(passthrough: Iterable[str]) -> int:
    return _run_publish_to_azure_blob(passthrough)


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
    return handler(passthrough)


@task
def setup(ctx, args=""):  # type: ignore[no-untyped-def]
    """Placeholder setup target."""
    tokens = args.split() if args else []
    raise SystemExit(_run_setup(tokens))


@task
def generate_azure_upload_plan(ctx, args=""):  # type: ignore[no-untyped-def]
    tokens = args.split() if args else []
    raise SystemExit(_run_generate_azure_upload_plan(tokens))


@task
def generate_azure_index(ctx, args=""):  # type: ignore[no-untyped-def]
    tokens = args.split() if args else []
    raise SystemExit(_run_generate_azure_index(tokens))


@task
def publish_to_azure_blob(ctx, args=""):  # type: ignore[no-untyped-def]
    tokens = args.split() if args else []
    raise SystemExit(_run_publish_to_azure_blob(tokens))


@task
def default(ctx, args=""):  # type: ignore[no-untyped-def]
    tokens = args.split() if args else []
    raise SystemExit(_run_default(tokens))


ns = Collection(
    setup,
    generate_azure_upload_plan,
    generate_azure_index,
    publish_to_azure_blob,
    default,
)
