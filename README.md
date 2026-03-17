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

- `npm run dev` starts the renderer, watches Electron processes, and launches the app in development mode
- `npm run build:prod` runs the production build plus the smoke test used before packaging

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/azure-storage-sync.md` - downstream release synchronization details
