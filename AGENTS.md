# HagiCode Desktop - Agent Configuration

## Root Configuration

Inherits all behavior from `/AGENTS.md` at the monorepo root. Local rules extend or override the root file for this repository.

## Project Context

This repository contains the Electron desktop client for HagiCode server management, packaging, onboarding, dependency handling, and embedded service orchestration.

## Working Directory

Run commands from `repos/hagicode-desktop/`.

## Key Commands

```bash
pnpm install
pnpm run dev
pnpm run build:prod
pnpm run build:tsc:check
pnpm run build:check          # tsc --noEmit + renderer build
pnpm run smoke-test
pnpm run package:smoke-test   # smoke test against a packaged build (requires the embedded runtime)
pnpm run test:source <test files>
pnpm run test:main:non-interactive
pnpm run test:agent-cli-probe
pnpm run verify:libs          # native library verification
pnpm run check:telemetry-bundle
pnpm run i18n:check
pnpm run build:win
pnpm run build:mac
pnpm run build:linux
```

## Key Paths

- `src/main/`: Electron main-process logic
- `src/preload/`: preload bridge and IPC surface
- `src/renderer/`: React renderer app
- `src/renderer/store/`: Redux store, slices, and thunks
- `src/renderer/i18n/`: desktop translations; `locales/` holds the YAML sources (generated runtime JSON lives in git-ignored `generated-locales/`)
- `src/renderer/assets/illustrations/`: compact AVIF artwork catalog, exposed through `index.ts`; keep new artwork small
- `src/renderer/assets/cat-sprite/`: cat-head sprite sheet (AVIF) used by the sidebar logo and start button; regenerate with `node scripts/build-cat-sprite.mjs` (needs `ffmpeg` and ImageMagick `magick`, `--check` verifies)
- `src/main/telemetry/`: PostHog telemetry (see `docs/cloud-telemetry.md`)
- `src/shared/`: types and catalogs shared by main and renderer (agent CLI catalog, telemetry events, package-source defaults)
- `src/ipc/handlers/`, `src/services/`: IPC handlers and preset loading/caching services
- `scripts/`: packaging, runtime preparation, and verification helpers
- `config/`, `native/StorePurchaseAddon/`: release/store packaging config and the Windows Store native addon
- `resources/manifest.yml`: Desktop hagiscript runtime manifest (managed .NET runtime pin); `schemas/`: JSON schemas (e.g. `index.schema.json`)
- `build.sh`, `build.ps1`, `build.cmd`, `pybuild/`, `pyproject.toml`: Python Invoke build entry (`python -m pybuild.entry <Setup|Build|GenerateR2UploadPlan|GenerateR2Index|PublishToR2>`); `smoke-test` asserts the wrappers dispatch to it
- `docs/`: development, i18n, telemetry, npm management, agent CLI probe, artifact signing, R2 storage sync, and channel testing guides (plus `docs/release-notes/`)
- `PRODUCT.md`, `DESIGN.md`: product and design context for UI work

## Agent Guidelines

- Respect the Electron boundary between main, preload, and renderer code.
- Do not bypass preload for renderer access to privileged Node or OS APIs.
- Keep renderer changes aligned with existing React and Redux Toolkit patterns.
- Route all user-facing strings through the repo's i18n flow: edit the YAML sources (en-US first), never the generated JSON, and run `pnpm run i18n:check`; it needs the global `hagi18n` CLI (see `docs/i18n-hagi18n.md`).
- Do not hand-edit git-ignored generated files such as `src/main/generated/` or `src/renderer/i18n/generated-locales/`; the `prepare:*` scripts regenerate them.
- Source tests run with `pnpm run test:source <test files>` (Node test runner with a TS loader); use Node 24, matching CI.
- There is no `pnpm test` script. Tests for the packaging/runtime scripts live in `scripts/__tests__/*.test.mjs` and `scripts/*.test.js`; run one with `node --test <file>`.
- New cloud telemetry events must be added to the typed event catalog and documented in `docs/cloud-telemetry.md`.
- If packaging, runtime bootstrapping, or native dependency behavior changes, run the relevant smoke or verification scripts.
- CI: `.github/workflows/pr-checks.yml` runs `pnpm install --frozen-lockfile`, `pnpm run build:tsc:check`, `pnpm run build:prod`, and `pnpm run smoke-test` on Node 24; `build.yml` handles release builds and `non-interactive-integration.yml` runs the packaged non-interactive check. Keep the PR checks passing.
- Desktop packages retain the managed .NET runtime and do not bundle Node or PM2 for Desktop-owned process management; external service distributions may still include their own Node tooling.

## References

- `README.md`

## Package management

- The repository uses pnpm, pinned in `package.json` `packageManager`. Run `corepack enable` once, then `pnpm install`. `pnpm-lock.yaml` is the only lockfile; do not commit `package-lock.json`.
- Settings live in `pnpm-workspace.yaml`. `allowBuilds` lists the dependencies whose install scripts may run (reviewed individually, `false` means reviewed and denied); review any new dependency that has an install script and add it there.
- A local registry mirror belongs in `~/.npmrc` only. Never commit a `registry=` line or a mirror URL; `pnpm run check:registry` (also run in CI) fails on any non-`registry.npmjs.org` `tarball` in the lockfile and on mirror hosts in tracked files.
- Undeclared imports fail under pnpm's strict layout: declare the package instead of hoisting it.
- Desktop-specific: `pnpm-workspace.yaml` sets `nodeLinker: hoisted` because Electron Forge refuses to package under pnpm's isolated layout; it also keeps `asar`/`prune` walking a flat `node_modules`. Approvals: `fs-xattr` and `macos-alias` (macOS-only DMG native addons) are allowed to build; `core-js` (banner only) and `fsevents` are denied. Electron has no install script in this lockfile.
- `scripts/` that manage the end-user runtime (`prepare-embedded-runtime.js`, `generate-managed-npm-packages.js`, `global-hagiscript.js`, `agent-cli-probe/`) deliberately keep calling `npm`: they install or probe npm packages for end users, not this repository's dependencies.
