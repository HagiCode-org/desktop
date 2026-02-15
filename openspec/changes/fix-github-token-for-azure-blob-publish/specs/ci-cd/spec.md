## MODIFIED Requirements

### Requirement: GitHub Token Configuration for Azure Storage Sync
The CI/CD workflow SHALL provide the GitHub Token to the Nuke build process using the Nuke GitHubActions integration pattern, with fallback to parameter-based configuration.

#### Scenario: EffectiveGitHubToken pattern implementation
- **GIVEN** the `Build.cs` GitHubActions attribute has `EnableGitHubToken = true`
- **AND** `Build.Partial.cs` defines `string EffectiveGitHubToken => GitHubActions?.Token ?? GitHubToken;`
- **WHEN** running in GitHub Actions environment
- **THEN** `EffectiveGitHubToken` SHALL use `GitHubActions.Instance.Token` (automatic)
- **AND** when running locally, SHALL fall back to `GitHubToken` parameter

#### Scenario: Environment variable mapping
- **GIVEN** the `sync-azure-storage.yml` workflow is configured
- **WHEN** setting GitHub authentication credentials
- **THEN** `GITHUB_TOKEN` environment variable SHALL be set in the workflow
- **AND** Nuke SHALL automatically inject it via `GitHubActions.Instance.Token`
- **AND** GitHub CLI commands SHALL use `GH_TOKEN` environment variable (GitHub CLI convention)

#### Scenario: Token availability in build process
- **GIVEN** the GitHub Actions workflow provides the token via `EnableGitHubToken = true`
- **WHEN** the Nuke `PublishToAzureBlob` target executes
- **THEN** `EffectiveGitHubToken` SHALL be populated
- **AND** `gh release download` command SHALL successfully authenticate via `GH_TOKEN`
- **AND** `gh release view` command SHALL successfully retrieve release information via `GH_TOKEN`

#### Scenario: Clear error messaging for missing token
- **GIVEN** the GitHub Token is not configured (both CI and parameter)
- **WHEN** the `PublishToAzureBlob` target executes
- **THEN** the system SHALL throw a clear exception with helpful guidance
- **AND** the error message SHALL include:
  - Effective token source check (CI vs parameter)
  - Configuration location (workflow env var or Nuke parameter)
  - Required permissions (read access to releases)
  - Reference to hagicode-release implementation
