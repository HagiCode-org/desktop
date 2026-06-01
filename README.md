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
npm run build:win:portable
npm run build:win:msix
npm run build:win:store
npm run build:linux:appimage
npm run build:linux:zip
npm run build:mac:x64:dmg
npm run build:mac:arm64:zip
```

- `npm run dev` prepares the optional bundled portable toolchain, starts the renderer, watches Electron processes, and launches the app in development mode
- `npm run dev:steam-mode` boots development mode directly against a fixed extracted runtime so Steam mode startup can be verified quickly
- `npm run build:prod` runs the production build plus the smoke test used before packaging
- `npm run build:win:store` is the workflow-facing Store packaging entrypoint used by `win_store_packer`; it loads `config/store-package.json`, accepts payload injection arguments, and emits machine-readable build metadata for downstream signing/publication
- platform packaging commands now map directly to the CI matrix so local artifact verification can follow the same release contract

### Development bundled Node runtime

Source-mode development uses the shared Desktop runtime tree under `resources/components/node/runtime/`, matching the packaged Desktop layout under `resources/extra/runtime/components/node/runtime/`. There is no separate `.runtime/node-dev/` runtime or `bundled-dev` dependency source.

`npm run dev` runs `predev`, which stages the governed Desktop runtime payloads for supported platforms: the embedded .NET runtime, the bundled Node toolchain, the vendored code-server runtime, and the vendored OmniRoute runtime.

Those `prepare:*` commands now delegate the staging workflow to `hagiscript runtime install` with a Desktop-specific manifest, so the runtime layout now lands under `resources/components/...` while the install orchestration stays inside hagiscript.

Managed npm packages are installed into Desktop-owned writable runtime data under `userData[/dev]/runtimeData/node/`:

- Unix-like platforms: `userData/runtimeData/node/node<major>/npmGlobal/bin` and `userData/runtimeData/node/node<major>/npmGlobal/lib/node_modules`
- Windows: `userData/runtimeData/node/node<major>/npmGlobal` and `userData/runtimeData/node/node<major>/npmGlobal/node_modules`

### Vendored service runtime activation

`code-server` and `omniroute` now use an archive-only packaged contract. Development staging places `.7z` payloads plus `.hagicode-runtime.json` markers under `resources/components/bundled/<service>/`, and packaged builds ship the same contract under `resources/extra/runtime/components/bundled/<service>/`.

Desktop does not execute those packaged roots directly. The first `Enable Runtime` action extracts the bundled archive into `userData/runtimeData/components/services/<service>/runtime/current`, validates the extracted layout there, and keeps `runtime/staging` under the same service home for atomic swaps and repair flows.


### Development runtime troubleshooting

- Download failures: check network access to the pinned host in `resources/manifest.yml` under `desktopExtensions.embeddedNodeRuntime`, or pre-populate the staged archive cache used by the bundled toolchain preparation script.
- Unsupported platform/architecture: the command uses the platforms pinned in `resources/manifest.yml` under `desktopExtensions.embeddedNodeRuntime`; add a governed platform entry before expecting detection to succeed.
- Version mismatch: rerun `npm run prepare:bundled-toolchain:optional` after governance updates so the staged executable matches the active Node version.

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/azure-storage-sync.md` - downstream release synchronization details
- `docs/i18n-hagi18n.md` - Desktop locale maintenance with hagi18n YAML sources and generated runtime JSON
