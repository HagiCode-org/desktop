# Hagicode Desktop

[简体中文](./README_cn.md)

Hagicode Desktop is the native control center for running and managing HagiCode Server on a developer machine.

## Product overview

The desktop app packages the HagiCode experience into a local-first workflow for setup, monitoring, upgrades, and day-to-day operations.

## Core capabilities

- Monitor local resources and service health from a desktop dashboard
- Start, stop, and switch embedded server versions without leaving the app
- Manage package sources, dependencies, and license information in one place
- Provide onboarding, tray integration, RSS updates, and bilingual UI support
- Offer agent executor choices such as Claude Code, Codex, and GitHub Copilot CLI

## Architecture at a glance

- `src/main/` - Electron main-process services for configuration, runtime control, and package management
- `src/preload/` - the bridge layer between desktop runtime and renderer UI
- `src/renderer/` - React-based desktop interface and Redux state
- `resources/` - packaged desktop assets
- `docs/` - deeper guides for development, signing, and storage sync

## Local development

```bash
npm install
npm run install:dev-node-runtime
npm run dev
npm run build:prod
```

- `npm run dev` starts the renderer, watches Electron processes, and launches the app in development mode
- `npm run build:prod` runs the production build plus the smoke test used before packaging
- `npm run install:dev-node-runtime` installs the governed embedded Node runtime for source-mode testing

### Development embedded Node runtime

The development runtime command installs the same governed Node version used by packaged Desktop into `.runtime/node-dev/`. The directory is ignored by git and contains three generated areas:

- `.runtime/node-dev/cache/` stores the downloaded pinned Node archive by archive name.
- `.runtime/node-dev/node/<version>/<platform>/` stores the extracted Node distribution.
- `.runtime/node-dev/runtime-metadata.json` records `nodeVersion`, `platform`, `arch`, `installRoot`, `nodeExecutablePath`, `installedAt`, archive details, and Node/npm/corepack probe results.

When the app runs from source, dependency detection validates this metadata, probes the referenced Node/npm executables, verifies the governed Node version, and reports a valid runtime as `bundled-dev`. Packaged builds continue to use packaged runtime paths first; `.runtime/node-dev/` is ignored outside source mode.

To clean the development runtime, delete `.runtime/node-dev/` and rerun `npm run install:dev-node-runtime` when needed.

### Development runtime troubleshooting

- Download failures: check network access to the pinned host in `resources/embedded-node-runtime/runtime-manifest.json`, or pre-populate `.runtime/node-dev/cache/` with the expected archive.
- Stale metadata: delete `.runtime/node-dev/runtime-metadata.json` or the whole `.runtime/node-dev/` directory, then rerun the install command.
- Unsupported platform/architecture: the command uses the platforms pinned in `resources/embedded-node-runtime/runtime-manifest.json`; add a governed platform entry before expecting detection to succeed.
- Version mismatch: rerun `npm run install:dev-node-runtime` after governance updates so metadata and the extracted executable match the active Node version.

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/azure-storage-sync.md` - downstream release synchronization details
