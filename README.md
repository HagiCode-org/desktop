# Hagicode Desktop

[![license](https://img.shields.io/badge/license-AGPL--3.0-ffd43b)](./LICENSE)
[![build](https://img.shields.io/github/actions/workflow/status/HagiCode-org/desktop/build.yml?branch=main&label=build)](https://github.com/HagiCode-org/desktop/actions/workflows/build.yml)

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
- Use tray integration for quick background access
- Use the UI in 10 languages, including English and Simplified Chinese

## Related guides

- `docs/development.md` - local development notes and update-source configuration
- `docs/artifact-signing.md` - Windows signing setup
- `docs/r2-storage-sync.md` - downstream release synchronization details
- `docs/i18n-hagi18n.md` - Desktop locale maintenance with hagi18n YAML sources and generated runtime JSON
