# Azure Storage Sync Configuration

This document describes how to configure Azure Storage for automatic release file synchronization using a Blob SAS URL.

## Overview

The Hagicode Desktop project uses two reusable GitHub Actions workflows to synchronize release assets to Azure Storage after `build.yml` finishes uploading the release assets and explicitly calls the sync pipeline:

- `sync-azure-storage.yml`: `plan + upload(matrix)`, and it can still run an internal `finalize` step for standalone push or manual recovery runs
- `finalize-azure-storage.yml`: single-writer `finalize` for the root `index.json`

Build entry routes through Python Invoke (`./build.sh` -> `python -m pybuild.entry`). Azure sync targets (`GenerateAzureUploadPlan`, `GenerateAzureIndex`, `PublishToAzureBlob`, `Default`) run as native Python under `pybuild/native/`.

This provides:

- **Redundant backup**: Files stored in both GitHub Releases and Azure Storage
- **CDN support**: Azure CDN can be configured for faster downloads
- **Geographic distribution**: Files available from Azure's global infrastructure
- **Bounded fan-out**: Eligible release assets are uploaded through a `plan -> upload(matrix) -> finalize` workflow instead of a single serial job

## Workflow Topology

The Azure sync pipeline now runs in three stages:

1. **plan**: Enumerates GitHub Release assets, filters out GitHub-generated source archives, writes `azure-upload-plan.json`, and emits the upload matrix.
2. **upload**: Starts one matrix shard per eligible release asset, downloads only that shard's assets, uploads the asset plus any `.torrent` sidecar, and publishes `publish-result-<shard>.json`.
3. **finalize**: A separate top-level reusable workflow downloads every shard result artifact, merges `PublishedArtifactMetadata`, generates the final root `index.json`, uploads it once, and writes the aggregated workflow summary.

This keeps the root `index.json` on a single-writer path while still allowing multiple runners and multiple blob uploads per shard to proceed in parallel. In the main release callers, `finalize` is surfaced as its own top-level job, so rerunning only the index publication step is explicit and does not repeat shard uploads.

### Concurrency Controls

Two independent knobs now control throughput:

- **Workflow shard concurrency**: `max_parallel` controls how many upload shards GitHub Actions may run simultaneously. The default is `3`.
- **Blob upload concurrency**: `AzureUploadConcurrency` controls how many files a single shard may upload to Azure Blob in parallel. The default is `4`.

If Azure throttling or runner network contention appears, reduce `max_parallel` first. If a single shard still takes too long because it contains multiple files or sidecars, lower or raise `AzureUploadConcurrency` as needed.

### Result Artifacts

The pipeline now produces these intermediate artifacts:

- `azure-upload-plan`: contains `azure-upload-plan.json` and `azure-upload-matrix.json`
- `publish-result-<shard>`: one machine-readable shard result JSON per upload shard
- `azure-sync-finalize-result`: the aggregated finalize result JSON used for the workflow summary

The dedicated `finalize` workflow reads `azure-upload-plan.json` from the same run so it uses the exact release metadata that the upload phase planned, instead of recalculating "latest release" at finalize time.

These files are intended for workflow diagnostics and reruns. GitHub Release assets remain the source of truth for binary downloads.

## Python Invoke Runtime Prerequisites

`sync-azure-storage.yml` and `finalize-azure-storage.yml` now install Python and locked dependencies before calling build entry.

Required local/CI runtime:

- Python `3.11`
- `pip install -r requirements.lock.txt`
- Build entry scripts call `python -m pybuild.entry`

Lock refresh process:

1. Update dependency versions in `pyproject.toml`.
2. Recreate lock file from clean virtualenv:
   - `python -m venv .venv`
   - `source .venv/bin/activate` (Linux/macOS) or `.\.venv\Scripts\Activate.ps1` (Windows)
   - `python -m pip install --upgrade pip`
   - `python -m pip install invoke==2.2.0`
   - `pip freeze | sort > requirements.lock.txt`
3. Commit `requirements.lock.txt` together with dependency change.

## Quick Setup (SAS URL Method)

The recommended method uses a single **Blob SAS URL** for authentication - no need to manage connection strings or access keys.

### 1. Create a Storage Account

If you don't already have an Azure Storage Account:

1. Go to the [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" and search for "Storage Account"
3. Configure the storage account:
   - **Subscription**: Choose your subscription
   - **Resource group**: Create or select an existing one
   - **Storage account name**: A globally unique name (e.g., `hagicodereleases`)
   - **Location**: Choose a region close to your users
   - **Performance**: Standard (recommended for release files)
   - **Redundancy**: LRS (Locally Redundant Storage) or GRS (Geo-Redundant Storage)
4. Click "Review + create", then "Create"

### 2. Create a Blob Container

After creating the storage account:

1. Navigate to your storage account in the Azure Portal
2. Under "Data storage", click "Containers"
3. Click "+ Container"
4. Enter a container name (e.g., `desktop-releases`)
5. Set the access level to "Private (no anonymous access)"
6. Click "Create"

### 3. Generate a Blob SAS URL

Generate a SAS URL for the container:

1. In your storage account, go to "Settings" → "Shared access signature"
2. Configure the SAS settings:
   - **Allowed services**: Blob only
   - **Resource type**: Container and Object
   - **Permissions**: Read, Write, Delete, List (minimum: Write, Create)
   - **Start and expiry date**: Set appropriate dates (e.g., 1 year or more)
3. Click "Generate SAS token and URL"
4. **Copy the Blob service SAS URL** - this is your `AZURE_BLOB_SAS_URL`

**Important**: The SAS URL format should be:
```
https://<account>.blob.core.windows.net/<container>?<sas-token>
```

Example:
```
https://mystorageaccount.blob.core.windows.net/desktop-releases?sp=rwdl&st=2024-01-01T00:00:00Z&se=2025-01-01T00:00:00Z&sv=2021-01-01&sr=c&sig=...
```

### 4. Configure GitHub Secret

Add the SAS URL as a GitHub secret:

1. Go to your repository on GitHub
2. Navigate to "Settings" → "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Name: `AZURE_BLOB_SAS_URL`
5. Value: Paste the SAS URL you copied
6. Click "Add secret"

**That's it!** Only one secret needs to be configured.

## File Organization

Files are organized in the Azure Storage container as follows:

```
desktop-releases/
├── index.json          # JSON index (auto-generated)
├── v1.0.0/
│   ├── Hagicode-Setup-1.0.0.exe
│   ├── Hagicode-1.0.0.dmg
│   ├── Hagicode-1.0.0.AppImage
│   └── hagicode-desktop-1.0.0.tar.gz
└── v1.1.0/
    ├── Hagicode-Setup-1.1.0.exe
    └── ...
```

Each release creates a new directory named after its version tag.

### Auto-Generated Index

The workflow automatically generates an `index.json` file in the container root with the following structure:

```json
{
  "updatedAt": "2024-01-15T10:30:00Z",
  "versions": [
    {
      "version": "1.1.0",
      "channel": "stable",
      "files": ["Hagicode-Setup-1.1.0.exe", "Hagicode-1.1.0.dmg", ...],
      "assets": [
        {
          "name": "Hagicode-Setup-1.1.0.exe",
          "path": "1.1.0/Hagicode-Setup-1.1.0.exe",
          "size": 123456789,
          "lastModified": "2024-01-15T10:25:00Z"
        },
        ...
      ]
    },
    {
      "version": "1.0.0-beta.1",
      "channel": "beta",
      "files": ["Hagicode-Setup-1.0.0-beta.1.exe", ...],
      "assets": [...]
    }
  ],
  "channels": {
    "stable": {
      "latest": "1.1.0",
      "versions": ["1.1.0", "1.0.0"]
    },
    "beta": {
      "latest": "1.0.0-beta.1",
      "versions": ["1.0.0-beta.1", "1.0.0-alpha.1"]
    },
    "dev": {
      "latest": "0.9.0-dev.1",
      "versions": ["0.9.0-dev.1"]
    }
  }
}
```

This JSON index provides:
- **Version list**: All available versions sorted newest first
- **File metadata**: Name, path, size, and last modified date for each file
- **Channel information**: Each version is categorized by release channel (stable, beta, dev)
- **Channel aggregation**: The `channels` object provides quick access to latest versions per channel
- **Programmatic access**: Easy to consume by applications and update checkers

### Channel Support

The workflow automatically categorizes versions into release channels based on version naming:

#### Channel Detection Rules

- **stable**: Versions without pre-release identifiers (e.g., `1.0.0`, `2.1.3`)
- **beta**: Versions with `-beta` or `-rc` identifiers (e.g., `1.0.0-beta.1`, `2.0.0-rc.1`)
- **dev**: Versions with `-alpha` or `-dev` identifiers (e.g., `1.0.0-alpha.1`, `1.0.0-dev.1`)

#### Manual Channel Override

You can manually specify the channel when triggering the build workflow:

1. Go to "Actions" tab in your repository
2. Select "Build Hagicode Desktop"
3. Click "Run workflow"
4. Select the desired channel from the "Release channel" dropdown
5. Click "Run workflow"

This is useful for testing or special release scenarios.

#### Backward Compatibility

The generated index.json is backward compatible:
- Desktop clients that don't support channels will ignore the `channels` object
- If the `channels` object is missing, the Desktop client defaults all versions to `beta` channel
- Existing index.json files without channels continue to work as before

## Workflow Usage

### Automatic Trigger

The workflow automatically runs when `build.yml` reaches its summary-gated release publish stage for a version tag.

**Important**: the Azure sync path is primarily caller-driven. The main build pipeline decides when it is safe to run, so the typical flow is:

1. Create and push a version tag (e.g., `git tag v1.0.0 && git push origin v1.0.0`)
2. The `build.yml` workflow is triggered and builds all platforms (Windows, macOS, Linux)
3. For tag releases, `build.yml` fans out package-level jobs in parallel: Windows `portable` plus `nsis`, Linux `AppImage` plus `tar.gz` plus `zip`, and macOS `x64` plus `arm64`
4. The `build-summary` job aggregates the Windows package matrix together with the Linux/macOS matrix results, resolves the release channel, and emits an explicit overall release status
5. When the normalized release status is `success`, `build.yml` calls `sync-azure-storage.yml` through `workflow_call` with an explicit `release_tag`, `release_channel`, and `run_finalize=false`
6. `sync-azure-storage.yml` runs the `plan` job and fans out one upload shard per eligible release asset
7. After the upload workflow succeeds, `build.yml` calls `finalize-azure-storage.yml`, which reads the plan artifact from the same run and publishes the root `index.json`

This caller-driven model avoids races where a GitHub Release exists before the signed Windows assets or other platform assets have finished uploading.

### Manual Trigger

You can manually trigger the standalone sync workflow to recover an existing release:

1. Go to "Actions" tab in your repository
2. Select "Sync Release to Azure Storage"
3. Click "Run workflow"
4. Enter the exact `release_tag` you want to sync
5. Optionally override `max_parallel` if you want a more conservative or more aggressive upload fan-out
6. The workflow will plan shards, upload eligible assets, and then finalize the root index

**Tip**: Manual trigger is useful for:
- Re-syncing an existing release to Azure Storage
- Testing the workflow configuration
- Syncing a specific release version

For full automated runs, the caller workflow now exposes `Finalize Azure Storage Sync` as a separate top-level job. If the shard uploads are already correct and only the root index needs another attempt, rerun that finalize job instead of re-running the upload fan-out. For standalone manual recovery, the original `sync-azure-storage.yml` workflow still supports a full end-to-end retry.

## CDN Configuration (Optional)

To configure Azure CDN for faster downloads:

1. In the Azure Portal, create a CDN profile
2. Create a CDN endpoint with your storage account as the origin
3. Configure caching rules as needed
4. Use the CDN endpoint URL for distributing download links

### Example CDN URL Format

```
https://<cdn-endpoint>.azureedge.net/<container-name>/<version>/<filename>
```

## Security Best Practices

1. **Use SAS URLs**: SAS URLs provide time-limited access with specific permissions
2. **Set appropriate expiry**: Choose a reasonable expiry date for your SAS token
3. **Limit permissions**: Only grant necessary permissions (Write, Create, List)
4. **Rotate tokens**: Regenerate SAS tokens periodically
5. **Monitor access**: Use Azure Monitor to track storage access
6. **Enable HTTPS only**: Ensure your storage account requires secure transfer

## Python Invoke Troubleshooting

### `python executable not found`

`build.sh` / `build.ps1` could not locate Python.

Fix:

- Install Python `3.11`
- Or set `PYTHON_EXE` to explicit interpreter path

### `No module named pybuild.entry`

Current working directory not repo root, or `PYTHONPATH` not set by wrapper.

Fix:

- Run `./build.sh` or `./build.ps1` from `repos/hagicode-desktop`
- Avoid calling `python -m pybuild.entry` from unrelated directory unless `PYTHONPATH` includes repo root

### `pip install -r requirements.lock.txt` fails in CI

Common cause: network timeout when resolving PyPI.

Fix:

- Retry runner job
- Check outbound network policy for `pypi.org` / `files.pythonhosted.org`

## Troubleshooting

### Workflow fails with "AZURE_BLOB_SAS_URL secret not found"

- Ensure you've added the `AZURE_BLOB_SAS_URL` secret to GitHub
- Check that the secret name matches exactly (case-sensitive)
- Verify the secret is in the repository (not organization) level

### Files are not uploaded

- Verify the storage account and container exist
- Check that the SAS URL has "Write" permission
- Ensure the SAS token hasn't expired
- Review the workflow logs for specific error messages
- Confirm the `plan` job found eligible assets and did not only detect GitHub-generated source archives
- Check the shard's `publish-result-<shard>.json` artifact to see whether the failure happened during metadata generation, sidecar generation, or blob upload

### Finalize blocks `index.json` publication

- Confirm every expected upload shard produced a `publish-result-<shard>.json` artifact
- Check the `azure-sync-finalize-result` artifact and workflow summary for the missing shard ID or failed stage
- If a shard failed after partially uploading blobs, rerun the workflow for the same tag; uploads are hash-aware and should skip unchanged blobs

### Azure throttling or upload is slower than expected

- Lower `max_parallel` to reduce the number of concurrent GitHub Actions shards
- Lower `AzureUploadConcurrency` if a single shard is overwhelming Azure Blob or runner network resources
- Raise `AzureUploadConcurrency` only after confirming the bottleneck is inside a single shard rather than across too many shards

### Authentication error

- Verify the SAS URL format is correct
- Check that "Write" and "Create" permissions are granted
- Ensure the container name in the SAS URL matches your actual container

### Cannot access uploaded files

- The container is private by design
- Configure a CDN endpoint or generate SAS tokens for public access
- Use Azure Storage Explorer for manual file verification

## Alternative: Connection String Method

If you prefer using connection strings instead of SAS URLs:

1. In your storage account, go to "Settings" → "Access keys"
2. Copy the connection string
3. Add as GitHub secret: `AZURE_STORAGE_CONNECTION_STRING`

However, **SAS URL is recommended** for better security and simpler configuration.

## Additional Resources

- [Azure Storage Documentation](https://docs.microsoft.com/azure/storage/)
- [Create a SAS token](https://docs.microsoft.com/azure/storage/common/storage-sas-overview)
- [Azure CLI Documentation](https://docs.microsoft.com/cli/azure/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
