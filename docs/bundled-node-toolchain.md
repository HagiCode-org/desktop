# Bundled Node Toolchain

HagiCode Desktop owns the portable Node/toolchain contract used by Desktop, portable-version, and steam_packer.

## Contract

- Pinned input manifest: `resources/embedded-node-runtime/runtime-manifest.json`
- Development output root: `resources/portable-fixed/toolchain/`
- Packaged output root: `resources/extra/portable-fixed/toolchain/` on Windows/Linux and `Contents/Resources/extra/portable-fixed/toolchain/` on macOS
- Required runtime: Node.js 22 plus npm
- Required managed CLI packages: `openspec`, `skills`, and `omniroute`
- Required output manifest: `toolchain-manifest.json` with `owner=hagicode-desktop` and `source=bundled-desktop`

## Local Staging

From `repos/hagicode-desktop`:

```bash
npm run prepare:bundled-toolchain
```

For a specific macOS architecture:

```bash
HAGICODE_EMBEDDED_NODE_PLATFORM=osx-arm64 npm run prepare:bundled-toolchain
```

The script downloads or reuses the pinned Node archive, verifies its SHA-256 checksum, stages `portable-fixed/toolchain/node`, installs the pinned CLI packages into `portable-fixed/toolchain/npm-global`, creates command shims under `portable-fixed/toolchain/bin`, and writes `portable-fixed/toolchain/toolchain-manifest.json`.

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

Packaged builds call `package:smoke-test`, which requires the bundled .NET runtime and Node toolchain. The smoke test verifies `node`, `npm`, `openspec`, `skills`, `omniroute`, and `toolchain-manifest.json` in both staged and packaged locations when present.

## Downstream Consumers

- `portable-version` validates the Desktop-authored manifest during Steam release hydration.
- `steam_packer` validates the same manifest and packages the Desktop-provided toolchain as input.
- Neither downstream repository should download Node, install npm packages, or define its own Node/toolchain version contract.
