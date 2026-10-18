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
npm run build:tsc:check
npm run smoke-test
npm run i18n:check
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
- `src/main/telemetry/`: PostHog telemetry (see `docs/cloud-telemetry.md`)
- `src/renderer/i18n/locales/`: YAML translation sources (generated runtime JSON lives in git-ignored `generated-locales/`)
- `scripts/`: packaging, runtime preparation, and verification helpers
- `docs/`: development, i18n, telemetry, npm management, and agent CLI probe guides
- `PRODUCT.md`, `DESIGN.md`: product and design context for UI work

## Agent Guidelines

- Respect the Electron boundary between main, preload, and renderer code.
- Do not bypass preload for renderer access to privileged Node or OS APIs.
- Keep renderer changes aligned with existing React and Redux Toolkit patterns.
- Route all user-facing strings through the repo's i18n flow: edit the YAML sources (en-US first), never the generated JSON, and run `npm run i18n:check`; it needs the global `hagi18n` CLI (see `docs/i18n-hagi18n.md`).
- Do not hand-edit git-ignored generated files such as `src/main/generated/` or `src/renderer/i18n/generated-locales/`; the `prepare:*` scripts regenerate them.
- Source tests run with `npm run test:source -- <test files>` (Node test runner with a TS loader); use Node 24, matching CI.
- New cloud telemetry events must be added to the typed event catalog and documented in `docs/cloud-telemetry.md`.
- If packaging, runtime bootstrapping, or native dependency behavior changes, run the relevant smoke or verification scripts.
- Desktop packages retain the managed .NET runtime and do not bundle Node or PM2 for Desktop-owned process management; external service distributions may still include their own Node tooling.

## References

- `README.md`
- `src/main/`
- `src/renderer/`
