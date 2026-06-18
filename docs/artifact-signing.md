# Windows Artifact Signing Configuration

This document explains how Hagicode Desktop signs Windows release artifacts in GitHub Actions with Azure Artifact Signing.

## Overview

The Windows build in `repos/hagicode-desktop/.github/workflows/build.yml` now uses this flow:

1. Decide whether signing is required.
2. Validate signing configuration from GitHub secrets.
3. Build Windows installers into `pkg/`.
4. Collect signable release artifacts from `pkg/` (`*Setup*.exe`, portable `.exe`) plus the `win-unpacked` app directory.
5. Stage the Windows unpacked ZIP payload workspace under `pkg/windows-zip-payload/`.
6. Preserve unsigned Windows artifacts for release traceability.
7. Authenticate to Azure with GitHub OIDC via `azure/login@v3`.
8. Sign Windows package artifacts through a catalog with `azure/artifact-signing-action@v2`.
9. Verify signatures before any release upload step runs.
10. Create the Windows ZIP from the signed staged unpacked payload before upload.
11. Upload build bundles first, then publish GitHub Release assets in parallel jobs, including unsigned fallbacks when retained.

The workflow now aligns MSIX manifest publisher metadata with the signing certificate subject through `WINDOWS_PACKAGE_PUBLISHER` so store-style packages and signature identity stay consistent.
Signed Windows artifacts are the primary release outputs, while unsigned counterparts are preserved with a `-unsigned` suffix for recovery and audit scenarios.

## Store Packaging Boundary

Desktop now builds Windows `.msix` artifacts in its own repository workflows alongside the existing installer outputs.
MSIX signing is attempted through the same Artifact Signing v2 path as the other Windows artifacts. If a given run still cannot sign MSIX successfully, the workflow retains only the unsigned MSIX fallback for that target instead of blocking the whole release.
The dedicated `repos/win_store_packer` repository remains the place for any downstream Store-specific repackaging, submission, or policy-specific adjustments that should not live in the Desktop release pipeline.

Desktop keeps the Store tile assets under `resources/msix/` so the Forge MSIX build and downstream Store tooling use the same visual payload.

## Production Environment Scope

The GitHub Actions `production` environment is attached to Windows jobs that must perform Azure OIDC signing, including the dedicated verification workflow and the tag-release Windows build job.
That means:

- Tag releases enter `production` before Windows signing starts.
- The `verify/windows-signing` verification workflow also enters `production` so its OIDC subject can match the configured environment.
- Unsigned Windows builds do not use the environment.
- The separate Azure Storage sync workflow is not bound to `production`.

## Azure Prerequisites

### 1. Register the Artifact Signing resource provider

In the Azure subscription used for signing, register the Artifact Signing resource provider.

### 2. Create signing resources

Create the following Azure Artifact Signing resources:

- Artifact Signing endpoint
- Signing account
- Certificate profile

Record these values after creation:

- Artifact Signing endpoint URL
- Signing account name
- Certificate profile name

### 3. Configure RBAC

Grant the GitHub Actions application identity the minimum roles needed to sign artifacts with the selected signing account and certificate profile.

Required role:

- `Artifact Signing Certificate Profile Signer`

### 4. Configure GitHub OIDC federation

Create a federated credential for the GitHub repository in Microsoft Entra ID so GitHub Actions can exchange its OIDC token for Azure access without a client secret.

Recommended subject patterns:

- Tag releases: `repo:HagiCode-org/desktop:ref:refs/tags/*`
- Main branch builds: `repo:HagiCode-org/desktop:ref:refs/heads/main`
- Manual workflow dispatch: same branch pattern as the branch that triggers the workflow

## GitHub Configuration

### Secrets

Add these repository secrets:

| Name | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Application (client) ID for the Entra app used by GitHub OIDC |
| `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID that hosts Artifact Signing |
| `AZURE_CODESIGN_ENDPOINT` | Azure Artifact Signing endpoint URL |
| `AZURE_CODESIGN_ACCOUNT_NAME` | Signing account name |
| `AZURE_CODESIGN_CERTIFICATE_PROFILE_NAME` | Certificate profile name |
| `WINDOWS_PACKAGE_PUBLISHER` | Certificate subject string used to override MSIX `Publisher` metadata |
| `FEISHU_WEBHOOK_URL` | Existing build/signing failure notification webhook |

## Signing Policy Switches

The workflow uses an explicit signing policy:

- `push` to `main`: build artifacts, skip signing, mark build as unsigned.
- `push` tag `v*.*.*`: require signing, fail before upload if configuration is missing or verification fails.
- `workflow_dispatch`: use the `sign_windows_release` boolean input to decide whether signing is required.

This keeps development builds fast while enforcing fail-closed behavior for release builds.

## Parallel Build And Upload Model

Release-oriented workflows now split Windows packaging into two phases:

1. Build job: compile, package, sign, verify, and upload a Windows build bundle as a GitHub Actions artifact.
2. Publish job: download that bundle and upload release assets to GitHub Releases in parallel with Linux and macOS publish jobs.

This reduces the amount of release upload work that blocks the Windows build runner and makes cross-platform uploads fan out in parallel.

## Authentication Notes

The Artifact Signing action authenticates through `DefaultAzureCredential`.
In this workflow, the primary path is:

1. GitHub Actions obtains an OIDC token.
2. `azure/login@v3` exchanges it for Azure access immediately before Artifact Signing runs.
3. `azure/artifact-signing-action@v2` signs files from the generated artifact catalog with the configured signing account and certificate profile.

The Azure login step is intentionally placed right before the signing action.
Windows packaging can take long enough for short-lived OIDC-backed Azure CLI assertions to expire if login happens earlier in the job.

## Local Signing

This repository does not maintain a custom local signing helper.
CI release signing is handled only by `azure/artifact-signing-action@v2`.

If manual signing is ever required for a one-off recovery scenario, use the Microsoft-recommended tooling directly on a Windows machine rather than re-introducing a repository-specific wrapper script.

## Troubleshooting

### Missing configuration in GitHub Actions

If the workflow summary reports missing Artifact Signing configuration:

1. Check repository secrets for `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
2. Check repository secrets for `AZURE_CODESIGN_ENDPOINT`, `AZURE_CODESIGN_ACCOUNT_NAME`, `AZURE_CODESIGN_CERTIFICATE_PROFILE_NAME`.
3. Re-run the workflow after updating the missing values.

### Azure login failure

If `azure/login@v3` fails:

1. Verify the Entra application exists and the client ID is correct.
2. Verify the federated credential subject matches the GitHub ref that triggered the workflow.
3. Verify the subscription and tenant IDs belong to the same Azure context.

### Signing fails with `AADSTS700024`

If Artifact Signing fails with `AADSTS700024: Client assertion is not within its valid time range`:

1. Confirm the workflow runs `azure/login@v3` immediately before `azure/artifact-signing-action@v2`.
2. Avoid moving Azure login ahead of long-running packaging or dependency-install steps.
3. Re-run the workflow after refreshing the Azure login placement or any reused runner login state.

### Signing succeeds but verification fails

If Artifact Signing completes but `scripts/verify-signature.js` fails:

1. Download the Windows artifact bundle from the failed run.
2. Verify it manually on a Windows machine with `signtool verify /pa <file>`.
3. Confirm the workflow signed the same file list that it later verified and uploaded.
4. Check whether the certificate profile supports the file type being signed.

### Store package issues

If a release still needs Microsoft Store packaging work:

1. Check `repos/win_store_packer` instead of the Desktop workflow.
2. Confirm Desktop release assets and metadata are available to the Store packer workflow.
3. Keep `resources/msix/` assets in sync with the Store visual requirements used by `win_store_packer`.

## References

- Azure Artifact Signing GitHub Action README: <https://github.com/Azure/azure-artifact-signing-action>
- Azure Trusted Signing GitHub Actions quickstart: <https://learn.microsoft.com/en-us/azure/trusted-signing/quickstart-github-actions>
