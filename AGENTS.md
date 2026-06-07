# HagiCode Desktop - Agent Configuration

## Root Configuration

Inherits all behavior from `/AGENTS.md` at the monorepo root. Local rules extend or override the root file for this repository.

## Project Context

This repository contains the Electron desktop client for HagiCode server management, packaging, onboarding, dependency handling, and embedded service orchestration.

## Working Directory

Run commands from `repos/hagicode-desktop/`.

## Key Commands

```bash
npm install
npm run dev
npm run build:prod
npm run smoke-test
npm run build:win
npm run build:mac
npm run build:linux
```

## Key Paths

- `src/main/`: Electron main-process logic
- `src/preload/`: preload bridge and IPC surface
- `src/renderer/`: React renderer app
- `src/renderer/store/`: Redux store, slices, and thunks
- `src/renderer/i18n/`: desktop translations
- `scripts/`: packaging, runtime preparation, and verification helpers

## Agent Guidelines

- Respect the Electron boundary between main, preload, and renderer code.
- Do not bypass preload for renderer access to privileged Node or OS APIs.
- Keep renderer changes aligned with existing React and Redux Toolkit patterns.
- Route all user-facing strings through the repo's i18n flow.
- If packaging, runtime bootstrapping, or native dependency behavior changes, run the relevant smoke or verification scripts.

## References

- `README.md`
- `src/main/`
- `src/renderer/`
