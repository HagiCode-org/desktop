# Bundled Node Toolchain

HagiCode Desktop owns the portable Node/toolchain contract used by Desktop, portable-version, and steam_packer.

## Contract

- Pinned input manifest: `resources/embedded-node-runtime/runtime-manifest.json`
- Development output root: `resources/portable-fixed/toolchain/`
- Packaged output root: `resources/extra/portable-fixed/toolchain/` on Windows/Linux and `Contents/Resources/extra/portable-fixed/toolchain/` on macOS
- Required runtime: Node.js 22 plus npm
- Deferred managed CLI packages: `openspec`, `skills`, and `omniroute`
- Required output manifest: `toolchain-manifest.json` with `owner=hagicode-desktop`, `source=bundled-desktop`, and `defaultEnabledByConsumer`

## Default Activation Policy

`resources/embedded-node-runtime/runtime-manifest.json` is the source of truth for consumer defaults:

- `defaultEnabledByConsumer.desktop = false`
- `defaultEnabledByConsumer.steam-packer = true`

`npm run prepare:bundled-toolchain` copies that matrix into the emitted `toolchain-manifest.json`; do not hard-code separate downstream defaults in build or packaging scripts.

Desktop still packages and verifies the bundled toolchain by default, but it does not automatically prepend bundled Node paths or resolve bundled `node`/`npm` unless the effective Desktop policy is enabled. To opt in manually for Desktop runtime activation, set:

```bash
HAGICODE_BUNDLED_NODE_ENABLED=true npm run dev
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

The script downloads or reuses the pinned Node archive, verifies its SHA-256 checksum, stages `portable-fixed/toolchain/node`, discovers the archive-provided `node` and `npm` entrypoints, removes any stale managed-package payload from earlier builds, and writes `portable-fixed/toolchain/toolchain-manifest.json` with deferred manual-install metadata for `openspec`, `skills`, and `omniroute`.

On Linux and macOS the staged runtime keeps the Desktop compatibility npm path at `node/bin/npm`. If the official archive exposes npm through an equivalent entry such as `node/lib/node_modules/npm/bin/npm-cli.js`, staging creates a small compatibility shim at `node/bin/npm` and records the resolved command in the manifest. The prepare step is non-interactive; when command discovery fails, the log includes the archive name, target platform, attempted candidate paths, and a shallow `toolchain/node` directory snapshot before exiting.

Desktop no longer guarantees that the managed CLI packages are preinstalled when the app ships. In this release:

- `node` and `npm` are the only required bundled executables.
- `toolchain-manifest.json` records pinned package versions, install specs, and `manualActionId` values for the deferred CLI packages.
- Users or support flows can install those packages later with the bundled npm and then refresh Desktop to re-evaluate availability.

## Packaging

The platform packaging scripts run toolchain staging before `electron-builder`:

```bash
npm run build:linux
npm run build:win
npm run build:mac:x64
npm run build:mac:arm64
```

`electron-builder.yml` ships `resources/portable-fixed/toolchain` to the canonical packaged `extra/portable-fixed/toolchain` location outside `app.asar`.

## Verification

Run the desktop smoke test after staging or packaging:

```bash
npm run smoke-test:verbose
```

Packaged builds call `package:smoke-test`, which requires the bundled .NET runtime and Node toolchain. The smoke test verifies `node`, `npm`, and the deferred package metadata contract in `toolchain-manifest.json` for both staged and packaged locations when present. For `node` and `npm`, smoke validation follows the manifest-resolved command paths first and only falls back to deterministic platform candidates when the manifest is unavailable.

## Downstream Consumers

- `portable-version` validates the Desktop-authored manifest during Steam release hydration.
- `steam_packer` validates the same manifest, requires `defaultEnabledByConsumer.steam-packer = true` when the field is present, and packages the Desktop-provided toolchain as input.
- Neither downstream repository should download Node, install npm packages, or define its own Node/toolchain version contract.
