# npm Management Catalog

The Desktop npm management page uses the catalog in `src/shared/npm-managed-packages.ts`.

The broader Desktop agent CLI support matrix lives separately in `src/shared/agent-cli-catalog.ts`.
Use that catalog for prompt guidance, diagnostics, and any feature that needs to know about non-npm install flows such as `kiro-cli`, `kimi`, `deepagents`, or `hermes`.
Keep `src/shared/npm-managed-packages.ts` limited to CLIs that Desktop can actually manage through npm.

To add a future Desktop-managed npm CLI tool:

- Add a `ManagedNpmPackageDefinition` entry with a stable `id`, npm `packageName`, display label, CLI `binName`, and `installSpec`.
- Add matching zh-CN and en-US strings under `npmManagement.packages.<id>.description` in `src/renderer/i18n/locales/*/common.json`.
- Extend the `ManagedNpmPackageId` union in `src/types/npm-management.ts`.
- Add or update tests that cover status detection, install/uninstall rejection for invalid ids, and renderer row display.

All install and uninstall operations are executed by `src/main/dependency-management-service.ts` with the embedded Desktop Node/npm executable. Mutable global packages are stored in the canonical Desktop runtime data root `~/.hagicode/runtime-data/node/node<major>/npmGlobal`, where `<major>` is derived from the active Desktop-managed Node runtime.

The bundled portable toolchain root remains the immutable runtime source for `node` and `npm` commands. It is not the active npm global package prefix. Dependency snapshots only inspect the active Node-major Desktop-managed prefix for managed package state.

## First-Run Preparation

The onboarding wizard now starts with an explicit language-selection step, then reaches the npm preparation step before the final package download step. The npm preparation step evaluates readiness with the shared catalog and the current `NpmManagementSnapshot`.

The step requires:

- Every package marked `required: true` in `src/shared/npm-managed-packages.ts` to be installed in the Desktop-managed npm environment.
- At least one selected npm-installable Agent CLI package to be installed in the Desktop-managed npm environment.
- The embedded Desktop-managed Node environment to be available. npm metadata is surfaced from that same governed runtime when it can be resolved, but npm no longer acts as a separate generic readiness gate.

The onboarding install action installs missing `hagiscript` first with the regular npm management `install('hagiscript')` operation. After that, it syncs missing required non-hagiscript packages and selected missing Agent CLI packages through the existing batch sync operation.

System-installed Node/npm binaries and globally installed CLI tools do not satisfy onboarding or home launch readiness. Users should use the onboarding npm preparation step or the npm management page so packages are installed into Desktop's own managed environment.

When home launch readiness is incomplete, the homepage primary action routes to npm management instead of starting the web service. Once required packages and at least one selected Agent CLI are ready, the normal start-service behavior is preserved.

## Non-Interactive Dependency Install

Packaged Desktop builds support a bounded non-interactive dependency command for CI/CD and automation:

```bash
Hagicode\ Desktop deps install --claude-code --codex
```

The command runs before Desktop creates BrowserWindow, tray, second-instance UI focus behavior, or long-running polling loops. It installs selected packages through the same `DependencyManagementService` path used by the interactive npm management UI.

Supported package flags are intentionally explicit:

- `--claude-code` maps to managed package ID `claude-code`.
- `--codex` maps to managed package ID `codex`.

The first non-interactive command does not accept arbitrary npm package names or package specs. New packages must be added to `src/shared/npm-managed-packages.ts` first, then exposed through an explicit CLI flag so install specs, executable names, managed locations, and verification behavior stay catalog-driven.

Before syncing selected Agent CLI packages, Desktop checks managed package ID `hagiscript`. If `hagiscript` is missing, unknown, or installed without an executable path, Desktop installs it through the embedded npm path and verifies it before continuing.

Exit codes are deterministic:

- `0` means all requested packages and `hagiscript` were verified as installed with executable paths under Desktop-managed npm locations.
- `64` means the command, subcommand, flags, or package selection were invalid.
- `69` means Desktop's managed Node/npm environment was unavailable.
- `70` means automatic `hagiscript` bootstrap installation or verification failed.
- `71` means requested package installation failed.
- `72` means post-install verification failed.
- `1` means an unexpected internal failure occurred.

Successful output includes the install root, managed modules root, managed bin root, and one status line per verified package. Failure output includes the failed stage and enough package or path detail for CI logs.
