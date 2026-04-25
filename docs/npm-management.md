# npm Management Catalog

The Desktop npm management page uses the catalog in `src/shared/npm-managed-packages.ts`.

To add a future Desktop-managed npm CLI tool:

- Add a `ManagedNpmPackageDefinition` entry with a stable `id`, npm `packageName`, display label, CLI `binName`, and `installSpec`.
- Add matching zh-CN and en-US strings under `npmManagement.packages.<id>.description` in `src/renderer/i18n/locales/*/common.json`.
- Extend the `ManagedNpmPackageId` union in `src/types/npm-management.ts`.
- Add or update tests that cover status detection, install/uninstall rejection for invalid ids, and renderer row display.

All install and uninstall operations are executed by `src/main/npm-management-service.ts` with the embedded Desktop Node/npm executable and the Desktop-managed global prefix under the portable toolchain root.

