# Nuke Build Cleanup Follow-up (Post Python Invoke Migration)

This note tracks cleanup scope after build entry migration to Python Invoke.

## What remains in `nukeBuild/`

Current Python tasks still forward Azure targets to existing Nuke logic:

- `GenerateAzureUploadPlan`
- `GenerateAzureIndex`
- `PublishToAzureBlob`
- `Default`

So `nukeBuild/` remains runtime dependency for those targets in this change.

## Safe next cleanup scope

Do in follow-up change after Python tasks own Azure logic directly:

1. Move Azure upload plan/index/publish implementation from C# (`nukeBuild`) to `pybuild/tasks.py` + helper modules.
2. Switch `pybuild/tasks.py` handlers from `dotnet run --project nukeBuild/_build.csproj` to native Python implementations.
3. Keep output contracts unchanged:
   - `artifacts/azure-upload-plan.json`
   - `artifacts/azure-upload-matrix.json`
   - `artifacts/azure-index.json`
   - `artifacts/publish-result-*.json`
   - `artifacts/finalize-result.json`
4. Remove now-unused `nukeBuild` Azure targets and related adapters/tests.
5. Remove any remaining `.NET SDK` requirement from Azure sync path if no longer needed.

## Not removed in this change

- `nukeBuild/` project files
- `nukeBuild` Azure adapters and models
- Existing C# tests under `nukeBuild.Tests/`

Reason: this migration focuses on entry/runtime switch + workflow Python provisioning with minimal behavior risk.
