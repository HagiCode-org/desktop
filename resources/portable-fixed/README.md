# Portable Fixed Payload

Stage the portable-version server payload under `resources/portable-fixed/current/` before packaging.

Expected runtime files inside `current/`:

- `manifest.json`
- `lib/PCode.Web.dll`
- `lib/PCode.Web.runtimeconfig.json`
- `lib/PCode.Web.deps.json`
- `config/` (optional runtime configuration directory)

The packaged app copies this directory to `resources/extra/portable-fixed/` outside `app.asar`.
