# Bundled Node Toolchain

HagiCode Desktop owns the portable Node/toolchain contract used by Desktop, portable-version, and steam_packer.

Desktop also uses this bundled Node toolchain to launch the vendored `code-server` and `omniroute` runtimes. That PATH injection stays scoped to Desktop-owned runtime startup and does not change the general web-service startup contract.

## Contract

- Pinned input manifest: `resources/manifest.yml` (`desktopExtensions.embeddedNodeRuntime`)
- Development output root: `resources/components/node/runtime/`
- Packaged output root: `resources/extra/runtime/components/node/runtime/` on Windows/Linux and `Contents/Resources/extra/runtime/components/node/runtime/` on macOS
- Required runtime: Node.js 22 plus npm
- Deferred managed CLI packages: `openspec` and `skills`
- Required output manifest: `toolchain-manifest.json` with `owner=hagicode-desktop`, `source=bundled-desktop`, and `defaultEnabledByConsumer`

## Default Activation Policy

`resources/manifest.yml` (`desktopExtensions.embeddedNodeRuntime`) is the source of truth for consumer defaults:

- `defaultEnabledByConsumer.desktop = true`
- `defaultEnabledByConsumer.steam-packer = true`

`npm run prepare:bundled-toolchain` now runs through `hagiscript runtime install`, then copies that matrix into the emitted `toolchain-manifest.json`; do not hard-code separate downstream defaults in build or packaging scripts.

Desktop packages and verifies the bundled toolchain by default, and it automatically prepends bundled Node paths for Desktop-managed startup when the effective Desktop policy remains enabled. To force the old system-PATH behavior for troubleshooting, set:

```bash
HAGICODE_BUNDLED_NODE_ENABLED=false npm run dev
```

Accepted true values are `1`, `true`, `yes`, `on`, and `enabled`; accepted false values are `0`, `false`, `no`, `off`, and `disabled`. The resolver priority is explicit override first, manifest default second, and legacy fallback last. Legacy manifests without `defaultEnabledByConsumer` keep the old Desktop activation behavior as a compatibility fallback.

## Local Staging

From `repos/hagicode-desktop`:

```bash
npm run prepare:bundled-toolchain
```

For a specific macOS architecture:

```bash
HAGICODE_EMBEDDED_NODE_PLATFORM=osx-arm64 npm run prepare:bundled-toolchain
```

The script downloads or reuses the pinned Node archive, verifies its SHA-256 checksum, stages `components/node/runtime/node`, discovers the archive-provided `node` and `npm` entrypoints, removes any stale managed-package payload from earlier builds, and writes `components/node/runtime/toolchain-manifest.json` with deferred manual-install metadata for `openspec` and `skills`.

On Linux and macOS the staged runtime keeps the Desktop compatibility npm path at `node/bin/npm`. If the official archive exposes npm through an equivalent entry such as `node/lib/node_modules/npm/bin/npm-cli.js`, staging creates a small compatibility shim at `node/bin/npm` and records the resolved command in the manifest. The prepare step is non-interactive; when command discovery fails, the log includes the archive name, target platform, attempted candidate paths, and a shallow `components/node/runtime/node` directory snapshot before exiting.

Desktop no longer guarantees that the managed CLI packages are preinstalled when the app ships. In this release:

- `node` and `npm` are the only required bundled executables.
- `toolchain-manifest.json` records pinned package versions, install specs, and `manualActionId` values for the deferred CLI packages.
- Users or support flows can install those packages later with the bundled npm and then refresh Desktop to re-evaluate availability.

## Packaging

The platform packaging scripts run toolchain staging before `electron-forge`:

```bash
npm run build:linux
npm run build:win
npm run build:mac:x64
npm run build:mac:arm64
```

`forge.config.js` and `scripts/forge-packaging-hooks.js` ship the generated `resources/bin` and `resources/components` trees to the canonical packaged `extra/runtime` location outside `app.asar`.

When vendored runtimes are staged, they live inside that same packaged runtime tree:

- `extra/runtime/components/bundled/code-server`
- `extra/runtime/components/bundled/omniroute`

## Verification

Run the desktop smoke test after staging or packaging:

```bash
npm run smoke-test:verbose
```

Packaged builds call `package:smoke-test`, which requires the bundled .NET runtime and Node toolchain. The smoke test verifies `node`, `npm`, and the deferred package metadata contract in `toolchain-manifest.json` for both staged and packaged locations when present. For `node` and `npm`, smoke validation follows the manifest-resolved command paths first and only falls back to deterministic platform candidates when the manifest is unavailable.

The same smoke test now validates the staged and packaged vendored `code-server` and `omniroute` layouts when those runtimes are present.

Release archives now have a second gate:

- `npm run package:verify-release-archives` extracts the generated Linux/macOS release archives from `pkg/` and validates the packaged `extra/runtime/components/node/runtime`, `extra/runtime/components/bundled/code-server`, and `extra/runtime/components/bundled/omniroute` payloads before upload.
- Windows workflows run the same verifier against the staged release ZIP that is built from `win-unpacked`, so the uploaded extractable archive is checked in the same way.

## Downstream Consumers

- `portable-version` validates the Desktop-authored manifest during Steam release hydration.
- `steam_packer` validates the same manifest, requires `defaultEnabledByConsumer.steam-packer = true` when the field is present, and packages the Desktop-provided toolchain as input.
- Neither downstream repository should download Node, install npm packages, or define its own Node/toolchain version contract.
