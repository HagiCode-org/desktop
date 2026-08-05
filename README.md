# Hagicode Desktop

[简体中文](./README_cn.md)

Hagicode Desktop helps developers set up, run, and manage HagiCode Server from a desktop app.

## Product overview

Hagicode Desktop brings common HagiCode tasks into one place: first-run setup, daily startup, service checks, version updates, package management, and AI agent selection.

## Core capabilities

- Guide first-time setup and keep daily server startup simple
- Start, stop, restart, and switch HagiCode Server versions from the desktop
- Monitor local resources, server status, and service health in one dashboard
- Manage package sources, dependencies, license information, and runtime updates
- Choose agent executors such as Claude Code, Codex, and GitHub Copilot CLI
- Receive RSS updates and use tray integration for quick background access
- Use English or Simplified Chinese UI out of the box

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
- `npm run build:win:store` is the workflow-facing Store packaging entrypoint used by `win_store_packer`; it loads `config/store-package.json`, accepts payload injection arguments, and emits machine-readable build metadata for downstream signing/publication, including Desktop version, Microsoft Store version, and the normalized Store package version
- platform packaging commands now map directly to the CI matrix so local artifact verification can follow the same release contract

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/r2-storage-sync.md` - downstream release synchronization details
- `docs/i18n-hagi18n.md` - Desktop locale maintenance with hagi18n YAML sources and generated runtime JSON
