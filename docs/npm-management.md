# npm Management

Desktop's dependency-management page discovers host `node` and `npm` on `PATH`, reports the
resolved global prefix, and manages catalogued CLI packages in that external prefix. Desktop
packages contain the managed .NET runtime, but do not bundle Node or PM2 for backend or auxiliary
service management. CLI package management and auxiliary services use their external installations.

For managed CLIs, Desktop prefers an existing executable in the managed prefix, then probes the
npm global `bin` (including `.cmd` and `.ps1` shims on Windows), then resolves from `PATH` using
`which` rather than `where.exe`.

The npm mirror setting applies to install and sync operations. Uninstall always targets the
external global location and requires confirmation in the UI. If host Node or npm is missing, install it outside Desktop, then refresh the dependency page.
The Desktop-owned backend lifecycle launches the managed .NET runtime directly and does not require
host or bundled PM2. External auxiliary services are not supervised by Desktop.

The managed package catalog is defined in `src/shared/npm-managed-packages.ts`; package IDs and
install specs remain catalog-driven so Desktop never executes arbitrary package input.
