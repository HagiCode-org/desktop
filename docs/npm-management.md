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

All install and uninstall operations are executed by `src/main/npm-management-service.ts` with the embedded Desktop Node/npm executable and the Desktop-managed global prefix under the portable toolchain root.

## First-Run Preparation

The onboarding wizard includes an npm preparation step before the final package download step. It evaluates readiness with the shared catalog and the current `NpmManagementSnapshot`.

The step requires:

- Every package marked `required: true` in `src/shared/npm-managed-packages.ts` to be installed in the Desktop-managed npm environment.
- At least one selected npm-installable Agent CLI package to be installed in the Desktop-managed npm environment.
- The embedded Desktop Node/npm environment to be available.

The onboarding install action installs missing `hagiscript` first with the regular npm management `install('hagiscript')` operation. After that, it syncs missing required non-hagiscript packages and selected missing Agent CLI packages through the existing batch sync operation.

System-installed Node/npm binaries and globally installed CLI tools do not satisfy onboarding or home launch readiness. Users should use the onboarding npm preparation step or the npm management page so packages are installed into Desktop's own managed environment.

When home launch readiness is incomplete, the homepage primary action routes to npm management instead of starting the web service. Once required packages and at least one selected Agent CLI are ready, the normal start-service behavior is preserved.
