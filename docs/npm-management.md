# npm Management

Desktop's dependency-management page discovers host `node` and `npm` on `PATH`, reports the
resolved global prefix, and manages catalogued CLI packages in that external prefix. Windows,
Linux, and macOS packages separately include a minimal bundled Node executable and managed PM2 production
dependencies for Desktop service startup. That PM2-only toolchain contains no npm CLI, npm cache,
or unrelated global tools and does not replace the host Node/npm environment used for general CLI
management.

For managed CLIs, Desktop prefers an existing executable in the managed prefix, then probes the
npm global `bin` (including `.cmd` and `.ps1` shims on Windows), then resolves from `PATH` using
`which` rather than `where.exe`.

The npm mirror setting applies to install and sync operations. Uninstall always targets the
external global location and requires confirmation in the UI. If host Node or npm is missing, install it outside Desktop, then refresh the dependency page.
Desktop-managed PM2 lifecycle does not depend on host Node or host PM2 on Windows, Linux, or macOS.

The managed package catalog is defined in `src/shared/npm-managed-packages.ts`; package IDs and
install specs remain catalog-driven so Desktop never executes arbitrary package input.
