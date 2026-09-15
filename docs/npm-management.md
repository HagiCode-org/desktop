# npm Management

Desktop uses the Node.js and npm installation provided by the host system. It does not bundle,
stage, or activate a Node runtime. The dependency-management page discovers `node` and `npm` on
`PATH`, reports the resolved global prefix, and manages catalogued CLI packages in that external
prefix.

The npm mirror setting applies to install and sync operations. Uninstall always targets the
external global location and requires confirmation in the UI. If Node or npm is missing, install it
outside Desktop, then refresh the dependency page.

The managed package catalog is defined in `src/shared/npm-managed-packages.ts`; package IDs and
install specs remain catalog-driven so Desktop never executes arbitrary package input.
