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
npm run dev
npm run build:prod
```

- `npm run dev` prepares the optional bundled portable toolchain, starts the renderer, watches Electron processes, and launches the app in development mode
- `npm run dev:steam-mode` boots development mode directly against a fixed extracted runtime so Steam mode startup can be verified quickly
- `npm run build:prod` runs the production build plus the smoke test used before packaging

### Development bundled Node runtime

Source-mode development uses the shared Desktop runtime tree under `build/desktop-runtime/current/components/node/runtime/`, matching the packaged Desktop layout under `resources/extra/runtime/components/node/runtime/`. There is no separate `.runtime/node-dev/` runtime or `bundled-dev` dependency source.

`npm run prepare:bundled-toolchain:optional` stages the governed Node runtime when the current platform is supported. `npm run dev` runs that preparation step through `predev`.

Managed npm packages are installed into Desktop-owned writable runtime data under `userData/runtimeData/node/`:

- Unix-like platforms: `userData/runtimeData/node/node<major>/npmGlobal/bin` and `userData/runtimeData/node/node<major>/npmGlobal/lib/node_modules`
- Windows: `userData/runtimeData/node/node<major>/npmGlobal` and `userData/runtimeData/node/node<major>/npmGlobal/node_modules`

### Development runtime troubleshooting

- Download failures: check network access to the pinned host in `resources/embedded-node-runtime/runtime-manifest.json`, or pre-populate the staged archive cache used by the bundled toolchain preparation script.
- Unsupported platform/architecture: the command uses the platforms pinned in `resources/embedded-node-runtime/runtime-manifest.json`; add a governed platform entry before expecting detection to succeed.
- Version mismatch: rerun `npm run prepare:bundled-toolchain:optional` after governance updates so the staged executable matches the active Node version.

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/azure-storage-sync.md` - downstream release synchronization details
- `docs/i18n-hagi18n.md` - Desktop locale maintenance with hagi18n YAML sources and generated runtime JSON
