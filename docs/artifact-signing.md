# Windows Artifact Signing Configuration

This document explains how Hagicode Desktop signs Windows release artifacts in GitHub Actions with Azure Artifact Signing.

## Overview

The Windows build in `repos/hagicode-desktop/.github/workflows/build.yml` now uses this flow:

1. Decide whether signing is required
2. Validate signing configuration from GitHub secrets
3. Authenticate to Azure with GitHub OIDC via `azure/login@v2`
4. Build Windows installers into `pkg/`
5. Collect signable artifacts (`*Setup*.exe`, portable `.exe`, `.appx`)
6. Sign artifacts with `azure/artifact-signing-action@v1`
7. Verify signatures before any upload or release step runs

Tag releases (`refs/tags/v*.*.*`) always require signing.
Manual `workflow_dispatch` runs can opt in with `sign_windows_release=true`.
Regular `main` branch builds stay unsigned by default and are marked as such in the Actions summary.

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
| `FEISHU_WEBHOOK_URL` | Existing build/signing failure notification webhook |

### Additional secrets

Add these repository secrets:

| Name | Purpose |
| --- | --- |
| `AZURE_CODESIGN_ENDPOINT` | Azure Artifact Signing endpoint URL |
| `AZURE_CODESIGN_ACCOUNT_NAME` | Signing account name |
| `AZURE_CODESIGN_CERTIFICATE_PROFILE_NAME` | Certificate profile name |

## Signing Policy Switches

The workflow uses an explicit signing policy:

- `push` to `main`: build artifacts, skip signing, mark build as unsigned
- `push` tag `v*.*.*`: require signing, fail before upload if configuration is missing or verification fails
- `workflow_dispatch`: use the `sign_windows_release` boolean input to decide whether signing is required

This keeps development builds fast while enforcing fail-closed behavior for release builds.

## Authentication Notes

The Artifact Signing action authenticates through `DefaultAzureCredential`.
In this workflow, the primary path is:

1. GitHub Actions obtains an OIDC token
2. `azure/login@v2` exchanges it for Azure access before the Windows build starts
3. `azure/artifact-signing-action@v1` signs files with the configured signing account and certificate profile

If you need to troubleshoot authentication behavior, the action also supports direct environment credentials and per-credential exclude switches. For this repository, OIDC remains the recommended path.

## Local Signing

This repository no longer maintains a custom local signing helper.
CI release signing is handled only by `azure/artifact-signing-action@v1`.

If manual signing is ever required for a one-off recovery scenario, use the Microsoft-recommended tooling directly on a Windows machine rather than re-introducing a repository-specific wrapper script.

## Troubleshooting

### Missing configuration in GitHub Actions

If the workflow summary reports missing Artifact Signing configuration:

1. Check repository secrets for `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
2. Check repository secrets for `AZURE_CODESIGN_ENDPOINT`, `AZURE_CODESIGN_ACCOUNT_NAME`, `AZURE_CODESIGN_CERTIFICATE_PROFILE_NAME`
3. Re-run the workflow after updating the missing values

### Azure login failure

If `azure/login@v2` fails:

1. Verify the Entra application exists and the client ID is correct
2. Verify the federated credential subject matches the GitHub ref that triggered the workflow
3. Verify the subscription and tenant IDs belong to the same Azure context

### Signing succeeds but verification fails

If Artifact Signing completes but `scripts/verify-signature.js` fails:

1. Download the Windows artifact from the failed run
2. Verify it manually on a Windows machine with `signtool verify /pa <file>`
3. Confirm the workflow signed the same file list that it later verified and uploaded
4. Check whether the certificate profile supports the file type being signed

## References

- Azure Artifact Signing GitHub Action README: <https://github.com/Azure/azure-artifact-signing-action>
- Azure Trusted Signing GitHub Actions quickstart: <https://learn.microsoft.com/en-us/azure/trusted-signing/quickstart-github-actions>
