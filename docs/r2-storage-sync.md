# R2 Storage Sync Configuration

Desktop release assets are published to Cloudflare R2 after the release build completes. GitHub Releases remain the source of truth; R2 provides the public download origin and the generated root `index.json`.

## Required configuration

Configure these GitHub Actions secrets in the `production` environment:

| Secret | Purpose |
| --- | --- |
| `R2_ENDPOINT` | S3-compatible Cloudflare R2 endpoint |
| `R2_BUCKET` | Release bucket name |
| `R2_ACCESS_KEY` | R2 API token access key |
| `R2_SECRET_KEY` | R2 API token secret |
| `R2_PUBLIC_BASE_URL` | Public download base URL |

`R2_REGION` is optional and defaults to `auto`.

## Workflow topology

`build.yml` invokes two reusable workflows after all release assets have been published:

1. `sync-r2-storage.yml` plans eligible GitHub Release assets and uploads one R2 shard per asset.
2. `finalize-r2-storage.yml` merges shard results, generates the root `index.json`, uploads it to R2, and applies retention cleanup.

The Actions UI displays these jobs as **Upload Release Shards to R2 Storage** and **Finalize R2 Storage Sync**. The intermediate artifacts are:

- `r2-upload-plan`, containing `r2-upload-plan.json` and `r2-upload-matrix.json`
- `publish-result-<shard>`, one result per uploaded shard
- `r2-sync-finalize-result`, the aggregated index publication result

If uploads succeed but index publication fails, rerun **Finalize R2 Storage Sync**. It uses the upload plan and successful shard results from the same workflow run, so it does not repeat package uploads.
