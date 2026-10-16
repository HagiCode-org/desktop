# Agent CLI probe integration tests

This document covers the CI suite that checks Desktop's Agent CLI probe against real installations. The suite runs the unmodified production probe (`SystemDiagnosticManager` and `resolveManagedCliExecutablePath`) after installing each CLI with each supported method on `ubuntu-latest`, `macos-latest` and `windows-latest`.

Workflow: [`.github/workflows/agent-cli-probe-integration.yml`](../.github/workflows/agent-cli-probe-integration.yml).
Case registry: [`scripts/agent-cli-probe/install-cases.mjs`](../scripts/agent-cli-probe/install-cases.mjs).

## Stages

| Stage | What it does |
| --- | --- |
| `plan` | Runs the harness unit tests and the coverage guard, then builds the matrix from the registry. |
| `probe` (one job per case) | `deps`, `control`, `install`, `oracle`, `refresh`, `probe`, `classify`. |
| `report` | Merges every case result into one OS x CLI x method report and applies the gate. |

Each `probe` job runs the phases as separate steps. `install`, `oracle`, `control` and `probe` use `continue-on-error`, so the failing phase is visible by name in the Actions UI. `classify` reads the step outcomes and decides the result class. The class follows the phase in which the case stopped. Error text is never matched.

## Result classes

| Class | Meaning | Blocks a PR | Blocks a strict run |
| --- | --- | --- | --- |
| `pass` | Every phase held. A known-issue case that passes also raises a notice to remove its marker. | No | No |
| `probe-defect` | The probe broke its contract, or a control false positive was found before install. | Yes | Yes |
| `env-failure` | The install failed (`install-failed`) or the installed CLI does not run (`install-unusable`). Probe code was not judged. | No (warning) | Yes |
| `skipped` | The probe did not run to a verdict, or the control was skipped because the runner image preinstalls the CLI. | No | No |
| `xfail` | A `probe` assertion failed on a case with a `knownIssue` marker. Shown separately in the report. | No | No |

Policies:

- **PR and push:** `probe-defect` fails the run. `env-failure` is shown as a warning.
- **Strict (weekly schedule, or `strict` on manual dispatch):** `env-failure` also fails the run.
- **Always:** the run fails when no case reached the probe step, or when the input is empty. A silent all-red install run therefore cannot pass.
- A `knownIssue` converts a `probe`-phase failure to `xfail`. It never converts `install`, `oracle` or `control` failures.

## Assertions

Every case runs two surfaces against the same installation:

- **Surface A (catalog probe).** The status must be `available`. The version must be semver-shaped and equal to the reference version, which the oracle captured. The resolved path must lie lexically inside the expected location for the method and OS. No other catalog CLI that the case did not install may be `available`, unless it is listed in `runnerPreinstalled`.
- **Surface B (managed resolver).** Only for npm-managed cases. The resolver gets a static path that does not exist. It must not return that path. On Windows it must prefer `.cmd`, then `.ps1`, then the extensionless shim. The executable it returns must report the reference version.

The control phase runs before install and expects `missing`. A CLI found before install is a `probe-defect` unless the registry allowlists it.

The expected-location matcher is lexical. It expands `$HOME`, `%USERPROFILE%`, `%LOCALAPPDATA%`, `%APPDATA%`, `%ProgramData%`, `npm-global-bin` and `brew-bin`. It normalises separators and trailing separators, and it is case-insensitive on Windows. It never calls `realpath`, so a symlinked bin is matched by the path the probe reports.

## Adding a CLI or an install method

1. Add a row to `installCases` in `scripts/agent-cli-probe/install-cases.mjs`. Each row is one combination of CLI, method, tier and operating systems. Example:

   ```js agent-cli-probe-example
   {
     id: 'example-cli/npm',
     cliId: 'example-cli',
     method: 'npm',
     tier: 'core',
     os: ['linux', 'macos', 'windows'],
     container: null,
     install: { kind: 'managed-npm' },
     managedPackageId: 'example-cli',
     probeSurfaces: ['A', 'B'],
     expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
     runnerPreinstalled: [],
     knownIssue: null,
     timeoutMinutes: 10,
     verification: 'managed',
     verifiedOn: '2026-10-15',
     source: 'src/shared/npm-managed-packages.ts',
   }
   ```

2. If the CLI is new to the catalog, add its id to `catalogCliIds` as well. The coverage guard fails until this is done, and it names the CLI.
3. For a method that cannot run on a hosted runner, add an entry to `exclusions` with a non-empty `reason` and a `source`. Exclusions are never silent.
4. Managed npm cases take their install command from `src/shared/npm-managed-packages.ts`, so a version pin change there is picked up without editing the registry.
5. Run `npm run probe:agent-cli:plan -- --dry-run` and `node --test scripts/__tests__/agent-cli-probe-harness.test.mjs`.

### `knownIssue`

A `knownIssue` marker sits next to the case in the registry, so its reason is reviewed with the case:

```js
knownIssue: { reason: 'probe reports 0.0.0 on the first run after install', trackedBy: 'https://github.com/example/issues/1' }
```

It converts a `probe`-phase `probe-defect` to `xfail`. When the case passes, the run emits a notice asking for the marker to be removed.

## Install safety

- **Execution guard.** `scripts/agent-cli-probe/install-cli.mjs` refuses to run an installer unless `GITHUB_ACTIONS=true` or `HAGICODE_AGENT_CLI_PROBE_ALLOW_INSTALL=1` is set.
- **Dry run.** `--dry-run` prints the planned commands and executes nothing. Example: `npm run probe:agent-cli:install -- --case claude-code/native-sh --dry-run`.
- **No secrets.** The installer receives an allowlisted environment only. No token or repository secret is passed, and the workflow requests `permissions: contents: read`.
- **Environment refresh.** On Windows, `post-install-env.mjs` rebuilds PATH from the persisted Machine and User values, so a newly opened terminal would see the same entries. It never adds a directory the install method did not persist. The refreshed value is applied inside the probe test process, as the only `PATH`, and is not exported through `GITHUB_ENV`. On Linux and macOS the runner environment passes through unchanged, and the probe's own login-shell resolution decides.
- **Retries.** An installer is retried up to 3 times with 15 s and 45 s back-off. npm installs add fetch-retry flags. The attempt count is recorded in `result.json`.

## Triggers, tiers and cost

| Trigger | Tiers | Strict |
| --- | --- | --- |
| `pull_request` and `push` to `main` (probe-relevant paths only) | `core` | No |
| `schedule` (weekly, Monday) | `core` and `extended` | Yes |
| `workflow_dispatch` | `tier` (default `core`; `core`, `extended` or `all`) | `strict` input |

`workflow_dispatch` also takes the `os` filter (`linux`, `macos` or `windows`) and the `cli` filter (a catalog id). Every provided filter must match. A newer run on the same ref cancels the older PR run. Each job has a 20-minute timeout and `fail-fast` is off.

`extended` cases run only on the schedule and on manual dispatch. They include the container cases for `dnf` and `apk`, and the Homebrew cask `@latest` variant. Container cases need Node in the image, which the workflow installs with the image's package manager.

## Reading the consolidated report

The report lists one row per CLI and method, with one column per operating system. Symbols:

- `pass`: every phase held.
- `FAIL`: `probe-defect`.
- `warn(env)`: `env-failure`.
- `skip`: `skipped`.
- `xfail`: known probe defect, shown separately with its reason.
- `--`: not scheduled for that operating system.

## Reproducing one case locally

Install opt-in and a temporary `HOME` and npm prefix keep the run isolated. Requires Node 24 and `npm ci --omit=dev --ignore-scripts` in this repository.

**Use a clean PATH.** The probe reads the inherited PATH, so any agent CLI already installed on your machine (for example Claude Code or Codex) is reported as a false positive by the "no other CLI is available" assertion. Put only the Node directory, the temporary npm bin and the system directories on PATH, as the example does.

```bash
export WORK="$(mktemp -d)"
export HOME="$WORK/home"; mkdir -p "$HOME"
export NPM_CONFIG_PREFIX="$WORK/npm"
export HAGICODE_AGENT_CLI_PROBE_ALLOW_INSTALL=1
export RUNNER_TEMP="$WORK/runner"
export HAGICODE_AGENT_CLI_PROBE_CASE=pi/npm
export HAGICODE_AGENT_CLI_PROBE_STATE="$RUNNER_TEMP/agent-cli-probe/state.json"
export PATH="$(dirname "$(command -v node)"):$NPM_CONFIG_PREFIX/bin:/usr/bin:/bin"

HAGICODE_AGENT_CLI_PROBE_PHASE=control npm run test:agent-cli-probe   # expects missing
npm run probe:agent-cli:install -- --case pi/npm
node scripts/agent-cli-probe/verify-installed-cli.mjs --case pi/npm
HAGICODE_AGENT_CLI_PROBE_PHASE=probe npm run test:agent-cli-probe
node scripts/agent-cli-probe/classify-result.mjs --case pi/npm --out "$RUNNER_TEMP/agent-cli-probe/results"
```

The `control` phase should report `missing`. The printed class from `classify-result.mjs` should be `pass` for a healthy install.

## Notes

- Install locations marked "confirm on the first run" in the registry are not pinned by the vendor docs. They were chosen from the docs' defaults and must be confirmed by a real run before the case is trusted.
- The Desktop probe source is not modified by this suite. Defects the first runs reveal become `knownIssue` markers and follow-up changes.
