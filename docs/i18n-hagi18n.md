# Desktop hagi18n workflow

Desktop translations are maintained as YAML source files under `src/renderer/i18n/locales/` and generated into runtime JSON under `src/renderer/i18n/generated-locales/`.

## Install and verify hagi18n

Install the latest global CLI:

```bash
npm install -g @hagicode/hagi18n@latest
```

Verify the installation before using the Desktop workflow:

```bash
hagi18n info
```

Desktop scripts call the globally installed `hagi18n` CLI directly.

## Source and runtime contract

- YAML files in `src/renderer/i18n/locales/<locale>/<namespace>.yml` are the source of truth.
- Generated JSON files in `src/renderer/i18n/generated-locales/<locale>/<namespace>.json` are runtime artifacts consumed by the renderer.
- `scripts/generate-i18n-resources.mjs` validates locale directories against `src/shared/desktop-languages.ts` and namespace files against `src/renderer/i18n/config.ts`.
- `generated-locales` is not committed. Dev, build, and check flows generate it automatically before the renderer consumes locale resources.
- Do not hand-edit `generated-locales`; regenerate it from YAML.

## Project-local commands

Run these from `repos/hagicode-desktop`:

```bash
pnpm run i18n:audit
pnpm run i18n:report
pnpm run i18n:doctor
pnpm run i18n:sync
pnpm run i18n:sync:write
pnpm run i18n:prune
pnpm run i18n:prune:write
pnpm run i18n:generate
pnpm run i18n:check
```

## Dry-run-first sync and prune workflow

`sync` and `prune` are preview-only by default.

1. Review drift with `pnpm run i18n:audit` and `pnpm run i18n:doctor`.
2. Preview additions with `pnpm run i18n:sync` or removals with `pnpm run i18n:prune`.
3. Apply the reviewed change with `pnpm run i18n:sync:write` or `pnpm run i18n:prune:write`.
4. Regenerate runtime resources with `pnpm run i18n:generate`.
5. Finish with `pnpm run i18n:check`.

## Adding or updating a translation key

1. Edit the YAML source files in `src/renderer/i18n/locales/`, starting with `en-US`.
2. Update every supported locale namespace so keys, arrays, and `{{placeholder}}` tokens stay aligned.
3. Run `pnpm run i18n:audit` and `pnpm run i18n:doctor`.
4. Run `pnpm run i18n:generate`.
5. Run `pnpm run i18n:check` before committing.
