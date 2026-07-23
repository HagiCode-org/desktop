# Nuke Build Cleanup (Completed)

Azure sync targets are implemented natively in Python under `pybuild/native/`.

## Removed

- `nukeBuild/`
- `nukeBuild.Tests/`
- `.nuke/`

## Current entry

```
./build.sh | ./build.ps1 | build.cmd
  → python -m pybuild.entry --target <Name> [passthrough...]
  → pybuild.native.*
```

## Targets

- `Setup`
- `GenerateAzureUploadPlan`
- `GenerateAzureIndex`
- `PublishToAzureBlob`
- `Default` (alias of `PublishToAzureBlob`)

## Output contracts (unchanged)

- `artifacts/azure-upload-plan.json`
- `artifacts/azure-upload-matrix.json`
- `artifacts/azure-index.json`
- `artifacts/publish-result-*.json`
- `artifacts/finalize-result.json`

## Runtime

- Python `3.11` + `requirements.lock.txt` (`invoke`)
- `gh` CLI for GitHub Release asset list/download
- Azure Blob REST via container SAS URL (stdlib HTTP; no Azure SDK required)
