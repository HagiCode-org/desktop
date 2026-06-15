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
- `npm run build:win:store` is the workflow-facing Store packaging entrypoint used by `win_store_packer`; it loads `config/store-package.json`, accepts payload injection arguments, and emits machine-readable build metadata for downstream signing/publication, including Desktop version, Windows Store version, and the normalized Store package version
- platform packaging commands now map directly to the CI matrix so local artifact verification can follow the same release contract

## Version identity

Store and portable builds can distinguish up to three version surfaces in the sidebar footer:

- Desktop version: the packaged Desktop app version
- Web version: the embedded Server/Web runtime version
- Windows Store version: an optional additional version field injected by `win_store_packer` for Store-aligned packaging flows

Desktop does not re-order or redefine its own app version because of Windows Store version support. `win_store_packer` injects the Windows Store version through `HAGICODE_WINDOWS_STORE_VERSION` and workspace package metadata, and Desktop only consumes that value for packaged metadata and optional UI display.

## Windows Store subscription support

The `Hagicode 赞助者计划` workspace remains visible in the sidebar across runtimes. Desktop only registers the subscription main-process service, preload bridge, IPC handlers, and automatic snapshot refresh when it resolves to the `win-store` distribution mode. Source-mode development, portable builds, and other non-Store channels keep the page as a Microsoft Store handoff surface for subscribing and installing the Store edition.

The Microsoft Store broker uses `dynwinrt` bindings generated into `src/main/subscription/generated-js/` for license and availability queries. Windows Store/MSIX packaging copies those bindings into `dist/main/subscription/generated-js/` so the packaged main process can load them directly.

Purchase requests are handled by a packaged C++ Node-API addon built under `native/StorePurchaseAddon/` and staged into `resources/extra/windows-store-purchase-addon/`. This keeps Microsoft Store purchase UI on the packaged desktop process without shipping a separate helper executable.

Run `npm run generate:store-bindings` on Windows after installing the optional `dynwinrt` toolchain, or let `npm run build:win:msix` / `npm run build:win:store` generate those bindings before packaging. Local verification of purchase and refresh flows must still happen from a packaged Windows Store/MSIX runtime for product `9N0BTGWV23M1`.

### Optional PSF injection for MSIX

When Windows Store packaging needs Package Support Framework process fixups, enable the same injection path validated in `electron_demo`:

```bash
HAGICODE_ENABLE_PSF=true \
HAGICODE_PSF_DIR=/absolute/path/to/psf \
npm run build:win:store -- --server-payload-path /abs/path/to/server-runtime
```

`HAGICODE_PSF_DIR` must contain `PsfLauncher64.exe`, `PsfRuntime64.dll`, `ProcessLauncherFixup64.dll`, and `FileRedirectionFixup64.dll`. When enabled, the Store manifest entry is redirected to `PsfLauncher64.exe`, and the packaged MSIX root receives the rendered `config.json` plus the required PSF binaries.

### Development bundled Node runtime

Source-mode development uses the shared Desktop runtime tree under `resources/components/node/runtime/`, matching the packaged Desktop layout under `resources/extra/runtime/components/node/runtime/`. There is no separate `.runtime/node-dev/` runtime or `bundled-dev` dependency source.

`npm run dev` runs `predev`, which stages the governed Desktop runtime payloads for supported platforms: the embedded .NET runtime and the bundled Node toolchain.

Those `prepare:*` commands now delegate the staging workflow to `hagiscript runtime install` with a Desktop-specific manifest, so the runtime layout now lands under `resources/components/...` while the install orchestration stays inside hagiscript.

Managed npm packages are installed into the canonical Desktop runtime data root under `~/.hagicode/runtime-data/node/`:

- Unix-like platforms: `~/.hagicode/runtime-data/node/node<major>/npmGlobal/bin` and `~/.hagicode/runtime-data/node/node<major>/npmGlobal/lib/node_modules`
- Windows: `~/.hagicode/runtime-data/node/node<major>/npmGlobal` and `~/.hagicode/runtime-data/node/node<major>/npmGlobal/node_modules`

This is a **breaking change**. New Desktop builds do not migrate, alias, or fall back to the previous `userData/runtimeData` layout; the old and new writable runtime data trees are fully separate.

### Development runtime troubleshooting

- Download failures: check network access to the pinned host in `resources/manifest.yml` under `desktopExtensions.embeddedNodeRuntime`, or pre-populate the staged archive cache used by the bundled toolchain preparation script.
- Unsupported platform/architecture: the command uses the platforms pinned in `resources/manifest.yml` under `desktopExtensions.embeddedNodeRuntime`; add a governed platform entry before expecting detection to succeed.
- Version mismatch: rerun `npm run prepare:bundled-toolchain:optional` after governance updates so the staged executable matches the active Node version.

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/azure-storage-sync.md` - downstream release synchronization details
- `docs/i18n-hagi18n.md` - Desktop locale maintenance with hagi18n YAML sources and generated runtime JSON
