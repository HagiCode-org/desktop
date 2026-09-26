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
- In Dependency Management, required packages are marked and selected packages can be combined into a batch install command that users can view and copy
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

- `npm run dev` prepares the managed .NET runtime, starts the renderer, watches Electron processes, and launches the app in development mode
- `npm run dev:steam-mode` boots development mode directly against a fixed extracted runtime so Steam mode startup can be verified quickly
- `npm run build:prod` runs the production build plus the smoke test used before packaging
- Desktop packages include the managed .NET runtime but no Desktop-managed Node or PM2 toolchain. Node/npm for CLI package management and auxiliary services is external.
- `npm run build:win:store` remains the workflow-facing Store packaging entrypoint; it prepares the managed .NET runtime and rejects Desktop-managed Node/PM2 assets in the generated MSIX. `win_store_packer` accepts its build metadata without the old PM2 toolchain field.
- platform packaging commands now map directly to the CI matrix so local artifact verification can follow the same release contract

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/r2-storage-sync.md` - downstream release synchronization details
- `docs/i18n-hagi18n.md` - Desktop locale maintenance with hagi18n YAML sources and generated runtime JSON
