# Development Guide

This document provides detailed information about developing and debugging HagiCode Desktop.

## Table of Contents

- [Update Source Configuration](#update-source-configuration)
- [macOS ARM64 Native Library Requirements](#macos-arm64-native-library-requirements)
- [Native Library Verification](#native-library-verification)
- [Development Workflow](#development-workflow)
- [Environment Variables](#environment-variables)
- [Web Service Runtime Recovery](#web-service-runtime-recovery)
- [Prompt Resource Resolution](#prompt-resource-resolution)
- [Debugging](#debugging)

## Update Source Configuration

HagiCode Desktop supports multiple update sources for fetching application versions. By default, the application uses the official HTTP index source for both development and production builds.

### Default Update Source

The default update source is configured to use the official HagiCode server:

- **Type**: HTTP Index
- **URL**: `https://index.hagicode.com/server/index.json`
- **Name**: HagiCode 官方源

This unified configuration ensures consistent version availability across development and production environments.

### Environment Variable Override

For development and testing purposes, you can override the default update source using the `UPDATE_SOURCE_OVERRIDE` environment variable.

#### Usage

```bash
# Linux/macOS
export UPDATE_SOURCE_OVERRIDE='{"type":"local-folder","name":"Local Dev Source","path":"/path/to/packages"}'
npm run dev

# Windows (PowerShell)
$env:UPDATE_SOURCE_OVERRIDE='{"type":"local-folder","name":"Local Dev Source","path":"C:\\path\\to\\packages"}'
npm run dev

# Windows (Command Prompt)
set UPDATE_SOURCE_OVERRIDE={"type":"local-folder","name":"Local Dev Source","path":"C:\\path\\to\\packages"}
npm run dev
```

#### Supported Source Types

##### 1. Local Folder Source

For local development and testing:

```json
{
  "type": "local-folder",
  "name": "Local Development",
  "path": "/path/to/release-packages"
}
```

##### 2. HTTP Index Source

For custom HTTP index servers:

```json
{
  "type": "http-index",
  "name": "Custom HTTP Source",
  "indexUrl": "https://custom-server.com/index.json"
}
```

##### 3. GitHub Release Source

For GitHub release sources:

```json
{
  "type": "github-release",
  "name": "GitHub Releases",
  "owner": "owner-name",
  "repo": "repo-name",
  "token": "optional-github-token"
}
```

### Configuration Validation

When using `UPDATE_SOURCE_OVERRIDE`, the configuration is validated for:

- Required fields based on source type
- Valid source type (`local-folder`, `github-release`, `http-index`)
- Proper JSON format

Invalid configurations will fall back to the default HTTP index source with a warning logged to the console.

## Development Workflow

### Starting Development Mode

```bash
# Start all development processes
npm run dev
```

This command:
1. Starts the Vite dev server for the renderer process
2. Compiles the main process in watch mode
3. Builds the preload script in watch mode
4. Launches Electron with the development configuration

### Building for Production

```bash
# Build all components
npm run build:all

# Build and verify
npm run build:prod
```

### Running Smoke Tests

```bash
# Quick validation
npm run smoke-test

# Verbose output
npm run smoke-test:verbose
```

### Region-Aware Source Fallback

Desktop now preserves structured `official` and `github-release` download sources from the HTTP index metadata so the main-process installer can route fallback traffic deterministically:

- `CN` locale snapshots prefer `official` first, then `github-release`
- `INTERNATIONAL` locale snapshots prefer `github-release` first, then `official`
- locale detection failures (`matchedRule = error-fallback`) deliberately fall back to `official` first

This priority only affects the HTTP/source-fallback path. Torrent-first behavior, `sha256` verification, extraction, and legacy single-source `directUrl` / `path` assets keep their existing semantics.

### Focused Verification

When touching desktop download routing, run the targeted main-process checks from `repos/hagicode-desktop`:

```bash
npx tsc --noEmit
npx tsc
node --test dist/main/__tests__/http-index-source-hybrid.test.js dist/main/__tests__/hybrid-download-coordinator.test.js dist/main/__tests__/region-detector.test.js
```

Use mocked `RegionDetector` results for `CN`, `INTERNATIONAL`, and `error-fallback` when smoke-checking fallback order. Legacy single-source assets should still download through the preserved `downloadUrl` path without requiring structured `downloadSources`.

## Clipboard Integration

Desktop now keeps standard clipboard behavior at the host layer even when
`autoHideMenuBar` is enabled:

- The application menu always registers the standard Electron `Edit` roles for
  undo, redo, cut, copy, paste, and select-all.
- Main-window content, attached WebView content, and in-app Hagicode windows
  all share the same focus-aware editing context-menu wiring.
- Native renderer copy actions should use the renderer clipboard helper so the
  browser clipboard API stays the first choice and the preload bridge is used
  only as a secure fallback.

### Manual Verification Checklist

Run these four checks after touching desktop clipboard behavior:

1. Copy and paste inside a native desktop input, such as the remote-mode URL
   field in Settings.
2. Copy and paste inside an input rendered by the embedded WebView.
3. Select read-only text inside the embedded WebView, then confirm the
   right-click menu exposes `Copy` and writes to the system clipboard.
4. Open Hagicode in a dedicated in-app window and confirm copy/paste shortcuts
   still apply to the focused field there.

## Environment Variables

### Application-Level Variables

- `NODE_ENV`: Set to `development` for development mode
- `HAGICO_CONFIG_PATH`: Optional path to configuration directory
- `UPDATE_SOURCE_OVERRIDE`: Override default update source (see above)
- `HAGICODE_DISABLE_ELECTRON_SANDBOX`: Optional process-level Electron sandbox disable override for restricted launch environments

### Electron Sandbox Disable Override

`HAGICODE_DISABLE_ELECTRON_SANDBOX` is an opt-in startup escape hatch for environments where Chromium sandbox startup fails before HagiCode Desktop becomes usable. When the value is truthy, the main process appends Electron's process-level `no-sandbox` command-line switch during early bootstrap before any managed `BrowserWindow` is created.

Accepted truthy values are case-insensitive and may include surrounding whitespace:

- `1`
- `true`
- `yes`
- `on`

Any missing value or other value keeps the default startup path and does not append sandbox-disabling switches for this feature.

#### Development Launch Examples

Run from `repos/hagicode-desktop`.

```bash
# Linux/macOS development mode
HAGICODE_DISABLE_ELECTRON_SANDBOX=1 npm run dev

# Windows PowerShell development mode
$env:HAGICODE_DISABLE_ELECTRON_SANDBOX = '1'
npm run dev

# Windows Command Prompt development mode
set HAGICODE_DISABLE_ELECTRON_SANDBOX=1
npm run dev
```

If you want to verify the built app path without packaging first, the same variable works with `npm start` because that command builds all desktop components and then launches Electron:

```bash
HAGICODE_DISABLE_ELECTRON_SANDBOX=true npm start
```

#### Packaged Launch Examples

For packaged builds, set the variable in the shell, shortcut, service wrapper, or launcher script before starting the desktop executable:

```bash
# Linux packaged executable
HAGICODE_DISABLE_ELECTRON_SANDBOX=yes ./Hagicode\ Desktop

# macOS packaged app bundle
HAGICODE_DISABLE_ELECTRON_SANDBOX=on open -a "Hagicode Desktop"
```

```powershell
# Windows PowerShell packaged executable
$env:HAGICODE_DISABLE_ELECTRON_SANDBOX = 'true'
& '.\Hagicode Desktop.exe'
```

#### Sandbox Terminology

- `HAGICODE_DISABLE_ELECTRON_SANDBOX` is a process-level launch override. It appends Electron/Chromium startup switches before managed windows are created.
- `webPreferences.sandbox` is a per-window renderer preference. Existing HagiCode Desktop managed windows keep their current renderer sandbox settings; this environment variable does not rewrite them.
- `app.enableSandbox()` enables sandboxing for renderers globally when used before renderer creation. This override is the opposite kind of emergency compatibility path and does not call `app.enableSandbox()`.
- `nodeIntegration` controls whether renderer code can access Node.js APIs. This feature does not change any existing `nodeIntegration` value and must not be used as the sandbox toggle.

Disabling Electron sandboxing weakens Chromium's process isolation and security boundaries for the whole desktop process. Use this only as a temporary compatibility workaround in restricted environments where the default launch path fails, and prefer fixing the host environment when possible. Startup logs include either `Electron sandbox override skipped` or a warning that `HAGICODE_DISABLE_ELECTRON_SANDBOX` disabled Electron sandboxing so support diagnostics can distinguish default and override-enabled launches.

### Example Configuration

```bash
# Development with local source
NODE_ENV=development \
HAGICO_CONFIG_PATH=./local_data_root \
UPDATE_SOURCE_OVERRIDE='{"type":"local-folder","name":"Local","path":"/path/to/packages"}' \
npm run dev
```

## Web Service Runtime Recovery

Desktop persists web service runtime metadata so it can recover truthful service
status after app restart when the backend process survives.

### Runtime State File

- Location: `<userData>/config/web-service.json`
- Core fields:
  - `lastSuccessfulHost`
  - `lastSuccessfulPort`
  - `savedAt`
- Runtime recovery fields:
  - `runtime.pid`
  - `runtime.host`
  - `runtime.port`
  - `runtime.startedAt`
  - `runtime.versionId`
  - `runtime.recoverySource`
  - `runtime.recoveryMessage`
  - `runtime.updatedAt`

Desktop treats the persisted listen host as the bind address. The renderer and
WebView derive a separate client-facing access URL from that host, so wildcard
binds such as `0.0.0.0` still open through loopback (`127.0.0.1`) locally.

### Recovery Decision Order

1. Load persisted runtime identity from `web-service.json`
2. Primary probe:
   - PID liveness
   - Port reachability
   - `GET /api/health` success
3. If primary probe fails, run process-signature fallback
4. Mark `stopped/error` only when both primary and fallback checks fail
5. Invalidate stale runtime identity on confirmed mismatch

## Embedded Runtime Staging

Desktop-hosted Hagicode Server startup uses a pinned private `dotnet` runtime instead of `start.ps1` / `start.sh`.
Windows and Linux builds now stage the runtime from a single manifest:

- Manifest: `resources/embedded-runtime/runtime-manifest.json`
- Current pinned channel: `.NET 10.0`
- Current pinned release: `10.0.5` (release date `2026-03-12`)
- Official release metadata: `https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json`
- Official download host allowlist: `builds.dotnet.microsoft.com`
- Supported Desktop private-runtime package targets in this flow:
  - `linux-x64`
  - `win-x64`

### Manifest format

```json
{
  "channelVersion": "10.0",
  "releaseVersion": "10.0.5",
  "source": {
    "provider": "microsoft",
    "releaseMetadataUrl": "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json",
    "allowedDownloadHosts": ["builds.dotnet.microsoft.com"]
  },
  "platforms": {
    "linux-x64": {
      "rid": "linux-x64",
      "archiveType": "tar.gz",
      "downloadUrl": "https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/10.0.5/aspnetcore-runtime-10.0.5-linux-x64.tar.gz"
    },
    "win-x64": {
      "rid": "win-x64",
      "archiveType": "zip",
      "downloadUrl": "https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/10.0.5/aspnetcore-runtime-10.0.5-win-x64.zip"
    }
  }
}
```

Update the manifest first whenever Desktop should move to a newer Microsoft runtime release.
The staging script, smoke tests, and GitHub Actions cache key all read from this file.

### Expected staged layout

Packaging expects the staged runtime layout below before `electron-builder` runs:

```
build/embedded-runtime/current/
??? dotnet/
    ??? <rid>/
        ??? dotnet[.exe]
        ??? .hagicode-runtime.json
        ??? host/fxr/10.0.5/...
        ??? shared/Microsoft.NETCore.App/10.0.5/...
        ??? shared/Microsoft.AspNetCore.App/10.0.5/...
```

The `.hagicode-runtime.json` file is generated during staging and travels with the packaged runtime.
Desktop startup uses it to distinguish:

- missing runtime payload
- unofficial runtime source
- pinned-version mismatch
- service payload incompatibility

### PM2-managed .NET service

Desktop starts the validated framework-dependent service payload through PM2 instead of holding the `dotnet` child process directly. The deterministic PM2 process name is `hagicode-dotnet-service`.

Before each start or restart, Desktop regenerates runtime files under `<userData>/config/pm2-dotnet-service/`:

- `.env`: sorted runtime environment values required by the .NET service, including host, port, data directory, pinned `DOTNET_ROOT`, and portable toolchain PATH entries.
- `ecosystem.config.js`: PM2 app definition with explicit `script`, `args`, `cwd`, process name, and `.env` file reference.

Desktop invokes PM2 with explicit argument arrays. Start and restart use `pm2 startOrReload <ecosystem.config.js> --update-env` so repeated user actions update the same PM2 app instead of creating duplicate entries. Stop uses `pm2 stop hagicode-dotnet-service`, and status uses `pm2 jlist` to map PM2 `online` state back to the existing Desktop service status model.

The `.env` file can contain sensitive runtime values. Desktop logs generated file paths and key counts only; it must not log the generated `.env` contents.

### Portable version payload contract

Steam-style portable-version builds can optionally bundle a fixed server payload under `resources/portable-fixed/current/` before `electron-builder` runs.

Expected layout:

```text
resources/portable-fixed/
??? current/
    ??? manifest.json
    ??? config/
    ??? lib/
        ??? PCode.Web.dll
        ??? PCode.Web.runtimeconfig.json
        ??? PCode.Web.deps.json
```

Packaging copies `resources/portable-fixed` into `resources/extra/portable-fixed`, so packaged builds look for the active portable payload at:

- Linux/Windows: `process.resourcesPath/extra/portable-fixed/current`
- macOS: `Contents/Resources/extra/portable-fixed/current`

If `current/` is missing, Desktop stays in normal mode. If `current/` exists but the required files are incomplete, Desktop logs the validation failure and safely falls back to normal mode.

Portable-version builds intentionally skip the first-run download flow and OpenSpec CLI guidance. The bundled Desktop Node environment now ships as `node` + `npm` plus deferred metadata for the managed CLI packages, so any future Steam-ready packaging work should preserve the same manual-handoff contract unless it also introduces an explicit user-triggered installation flow.

### Steam Linux startup compatibility

Packaged Linux builds now evaluate Steam runtime hints before the first `BrowserWindow` is created.

- Direct CLI startup already works and stays on the default graphics path.
- Steam-launched packaged Linux sessions enable an early software-rendering compatibility path only when the startup detector sees Steam-specific runtime evidence.
- The detector records `launchSource`, whether compatibility mode was enabled or skipped, and the `detectorCategory` that explains the decision.
- Later startup-failure payloads preserve the same compatibility snapshot so service-start triage can separate graphics-mode handling from unrelated errors.

Look for structured main-process logs like:

```text
[StartupCompatibility] Steam Linux compatibility mode enabled {
  launchSource: 'steam',
  compatibilityMode: 'steam-linux-software-rendering',
  compatibilityEnabled: true,
  detectorCategory: 'steam-runtime-env+portable-payload'
}
```

Validation guidance for packaged Linux artifacts:

1. Launch the packaged app directly from a shell and confirm the log records `compatibilityEnabled: false` with `launchSource: 'direct-cli'`.
2. Launch the same packaged payload through Steam and confirm the log records `compatibilityEnabled: true` before the first window is created.
3. If service startup later fails, copy the startup-failure log and verify the `[StartupCompatibility]` line is still present at the top of the captured diagnostics.

Steam-distributed Linux artifacts also ship a dedicated wrapper at `hagicode-steam-wrapper.sh` in the package root. Use that wrapper as the Steamworks `Executable` when possible. The wrapper:

- clears `LD_PRELOAD` before launch so the Steam overlay injection path does not crash Electron during zygote startup
- launches `hagicode-desktop` with `--disable-setuid-sandbox --no-sandbox`

The package root also includes `hagicode-steam-sandbox.sh`, which opens the sandbox startup help page in the default browser. It currently targets `https://docs.hagicode.com` and can be used as a temporary Steamworks `Executable` when you want the Linux artifact to redirect users to sandbox launch guidance instead of booting the desktop binary directly.

Recommended Steamworks fields for the packaged Linux artifact:

- `Executable`: `hagicode-steam-wrapper.sh`
- `Arguments`: leave empty unless you need app-specific arguments

### Dev startup for portable version mode

Use the dedicated dev command when you want Electron dev mode to boot directly into portable version mode with an already-extracted server payload:

```bash
npm run dev:portable-version
```

Behavior:

- Reuses the same pinned Desktop runtime preparation as `npm run dev:embedded-runtime`
- Loads `.env`, `.env.local`, `.env.development`, and `.env.development.local` before resolving overrides
- Sets `HAGICODE_PORTABLE_RUNTIME_ROOT` before launching `npm run dev`
- Prefers a valid extracted Linux x64 runtime from these workspace outputs:
  - `../local_deployment/linux-x64` or `../local_deployment/linux-x64-nort`
  - `../local_publishment/.local-publishment/linux-x64` or `../local_publishment/.local-publishment/linux-x64-nort`
  - `../hagicode-core/Release/release-structured/linux-x64` or `../hagicode-core/Release/release-structured/linux-x64-nort`
  - `../hagibuild/Release/release-structured/linux-x64` or `../hagibuild/Release/release-structured/linux-x64-nort`
- When the extracted runtime has `lib/PCode.Web.dll` but no top-level `manifest.json`, the script stages a temporary dev bridge payload under `build/portable-version-runtime/current`

Override the extracted runtime directory explicitly when needed:

```bash
HAGICODE_PORTABLE_RUNTIME_ROOT=/absolute/path/to/extracted/runtime npm run dev:portable-version
```

You can also put the override into `repos/hagicode-desktop/.env.local`:

```bash
HAGICODE_PORTABLE_RUNTIME_ROOT=../local_publishment/.local-publishment/linux-x64-nort
```

The override should point at the extracted runtime root. If that root already contains `manifest.json` and `lib/PCode.Web.dll`, it is used directly. If it only contains the managed payload under `lib/`, the dev script creates the temporary bridge payload automatically.

### Preparing the staged runtime

Run from `repos/hagicode-desktop`:

```bash
npm run prepare:runtime
```

Behavior:

1. Reads `resources/embedded-runtime/runtime-manifest.json`
2. Verifies the target download URL is HTTPS and uses an allowed Microsoft host
3. Downloads the pinned archive into `build/embedded-runtime/downloads/`
4. Extracts the runtime into `build/embedded-runtime/current/dotnet/<rid>/`
5. Writes `.hagicode-runtime.json` and `.runtime-stage.json`
6. Verifies the staged payload exposes the pinned `host/fxr`, `Microsoft.NETCore.App`, and `Microsoft.AspNetCore.App` versions

### Packaged runtime location

`electron-builder.yml` ships `build/embedded-runtime/current/dotnet` through `extraResources`, so the packaged runtime remains outside `app.asar`:

- Packaged Linux: `pkg/linux-unpacked/resources/dotnet/<rid>`
- Packaged Windows: `pkg/win-unpacked/resources/dotnet/<rid>`
- Runtime resolution in production: `process.resourcesPath/dotnet/<rid>`

The same `extraResources` block also copies `resources/portable-fixed` to `resources/extra/portable-fixed/` when a portable-version payload has been staged.

Desktop does not fall back to a machine-wide `dotnet` installation when that packaged runtime is missing.

### Development debugging with the staged runtime

Use the helper when debugging Desktop with the same private runtime that packaging uses:

```bash
npm run dev:embedded-runtime
```

Notes:

- Windows and Linux are supported in this helper flow.
- The helper stages the pinned runtime first, then launches `npm run dev` with:
  - `HAGICODE_EMBEDDED_DOTNET_PLATFORM=<rid>`
  - `HAGICODE_EMBEDDED_DOTNET_ROOT=<repo>/build/embedded-runtime/current/dotnet/<rid>`
- Development runtime resolution reuses the staged runtime directly instead of relying on global `dotnet`.

Manual override remains available:

```bash
export HAGICODE_EMBEDDED_DOTNET_ROOT="$PWD/build/embedded-runtime/current/dotnet/linux-x64"
npm run dev
```

Windows PowerShell example:

```powershell
$env:HAGICODE_EMBEDDED_DOTNET_ROOT = "$PWD/build/embedded-runtime/current/dotnet/win-x64"
npm run dev
```

### Verification commands

Before packaging:

```bash
npm run build:all
npm run smoke-test
```

After packaging Windows/Linux artifacts:

```bash
npm run package:smoke-test
```

`package:smoke-test` validates both:

- staged runtime payload under `build/embedded-runtime/current/dotnet/<rid>`
- packaged runtime payload under `pkg/<platform>-unpacked/resources/dotnet/<rid>`
- pinned metadata (`.hagicode-runtime.json`) matches the manifest and official Microsoft source host

### Release archive outputs

Desktop release packaging now publishes extractable ZIP archives alongside the existing platform installers:

- Linux keeps the native Electron Builder outputs (`.AppImage`, `.tar.gz`) and now also emits a `.zip` from the same packaging workspace.
- Windows keeps the portable `.exe`, NSIS installer, and `.appx`, then stages the unpacked app directory into a ZIP payload so the release ZIP behaves as an extract-and-run package instead of a zipped single-file launcher.
- Non-tag CI runs upload the Windows and Linux ZIP files as workflow artifacts.
- Tagged builds attach the ZIP files to the GitHub Release, and the downstream Azure sync continues mirroring them with the rest of the release asset set.

### GitHub Actions runtime preparation

The Desktop Windows and Linux packaging jobs now share the same runtime rules as local builds:

- cache key source: `hashFiles('resources/embedded-runtime/runtime-manifest.json')`
- cached download directory: `build/embedded-runtime/downloads`
- explicit build env:
  - Windows: `HAGICODE_EMBEDDED_DOTNET_PLATFORM=win-x64`
  - Linux: `HAGICODE_EMBEDDED_DOTNET_PLATFORM=linux-x64`
- build entrypoint: `node scripts/ci-build.js --platform <win|linux>`
- package validation: `npm run package:smoke-test`

When CI fails, diagnose in this order:

1. `prepare:runtime` failed before packaging
2. staged `.hagicode-runtime.json` does not match the pinned manifest
3. packaged `resources/dotnet/<rid>` is missing or landed in the wrong location
4. the service payload is missing `PCode.Web.dll`, `PCode.Web.runtimeconfig.json`, or `PCode.Web.deps.json`

### Operational diagnostics

#### Missing runtime payload

Symptoms:

- Desktop logs `Pinned runtime missing or incomplete`
- `package:smoke-test` reports missing `dotnet[.exe]`, `host/fxr`, `Microsoft.NETCore.App`, or `Microsoft.AspNetCore.App`

Actions:

1. Re-run `npm run prepare:runtime`
2. Confirm `build/embedded-runtime/current/dotnet/<rid>` exists
3. Rebuild the package and rerun `npm run package:smoke-test`

#### Unofficial runtime source

Symptoms:

- Desktop logs `Pinned runtime source validation failed`
- smoke test reports the download URL host is not in `allowedDownloadHosts`

Actions:

1. Inspect `resources/embedded-runtime/runtime-manifest.json`
2. Confirm `platforms.<rid>.downloadUrl` still points to `builds.dotnet.microsoft.com`
3. Remove stale archives from `build/embedded-runtime/downloads/` and stage again

#### Pinned-version mismatch

Symptoms:

- Desktop logs `Pinned runtime version mismatch`
- smoke test reports metadata or staged directory versions differ from the manifest

Actions:

1. Compare `.hagicode-runtime.json` with `runtime-manifest.json`
2. Check `host/fxr`, `shared/Microsoft.NETCore.App`, and `shared/Microsoft.AspNetCore.App` version directories
3. Clear `build/embedded-runtime/current/` and rerun `npm run prepare:runtime`

#### Invalid service payload or runtime incompatibility

Symptoms:

- Desktop logs `Invalid service payload`
- Desktop logs `Pinned runtime version incompatible`

Actions:

1. Verify the service package still contains:
   - `lib/PCode.Web.dll`
   - `lib/PCode.Web.runtimeconfig.json`
   - `lib/PCode.Web.deps.json`
2. Compare `PCode.Web.runtimeconfig.json` and manifest runtime constraints with the pinned Desktop runtime version
3. Republish the service package if it was accidentally built without framework-dependent runtime metadata

## Prompt Resource Resolution

The desktop app resolves Smart Config, Diagnosis, and version-level dependency prompts into a shared prompt-guidance payload for the renderer.

### Resource Keys and Target Files

- `smartConfig` -> `config/config-prompt.llm.txt`
- `diagnosis` -> `scripts/diagnosis-prompt.llm.txt`
- `versionDependencies` -> prompt path declared in the installed version's `manifest.json`

### Resolution Order

For both entry points, path lookup follows this order:

1. Active installed version directory (`apps/installed/<activeVersionId>/...`)
2. Packaged resource locations (`process.resourcesPath`, `app.asar.unpacked`, `app.getAppPath()`)
3. Development fallback (`process.cwd()`, development root)

### Structured Diagnostic Fields

When prompt guidance is requested, IPC responses include:

- `promptContent`: resolved prompt text for copy/paste when lookup succeeds
- `promptPath`: fully resolved prompt file path
- `promptSource`: where the prompt came from (`active-version`, `packaged-resource`, `development-root`, `manifest-entry`, etc.)
- `attemptedPaths`: ordered candidate path list that was checked
- `activeVersion`: active version id at lookup time (if available)
- `supportedTools`: centrally registered CLI metadata, including docs links for shared renderer chips/buttons
- `suggestedWorkingDirectory`: the directory Desktop recommends opening before pasting the prompt

Desktop no longer persists or reads `agentCliSelection`; any legacy electron-store value is ignored.

When prompt resolution fails, the same payload keeps `attemptedPaths`, `activeVersion`, and a stable `errorCode` (`PROMPT_NOT_FOUND`, `INVALID_PROMPT_PATH`, etc.) so the renderer can show a structured troubleshooting state instead of auto-launching a terminal.

## Debugging

### Main Process Debugging

The main process can be debugged using Chrome DevTools:

1. Start the application in development mode
2. The main process will automatically open DevTools on startup
3. Use the console and inspector for debugging

### Renderer Process Debugging

The renderer process can be debugged using standard browser DevTools:

1. Open the application
2. Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
3. Use the familiar Chrome DevTools interface

### Logging

The application uses `electron-log` for logging:

- Main process logs are written to the console and log files
- Log files are located in the application's user data directory
- Use `log.info()`, `log.warn()`, `log.error()`, etc. for logging

### Common Issues

#### Update Source Not Working

If the update source is not working as expected:

1. Check the console for error messages
2. Verify the `UPDATE_SOURCE_OVERRIDE` JSON syntax
3. Ensure the specified path or URL is accessible
4. Check network connectivity for HTTP sources

#### Local Folder Source Not Found

If using a local folder source:

1. Verify the path is absolute and correct
2. Ensure the folder contains valid package files
3. Check file permissions for the specified directory

#### HTTP Index Source Fails

If the HTTP index source fails:

1. Verify the URL is accessible in a browser
2. Check network connectivity
3. Ensure the index.json format is valid
4. Check for authentication requirements

## Additional Resources

- [Azure Storage Sync Configuration](./azure-storage-sync.md)
- [macOS Native Library Troubleshooting](./macos-native-library-troubleshooting.md)
- [Channel Testing Guide](./channel-testing-guide.md)
- [OpenSpec Proposals](../openspec/README.md)
- [Project README](../README.md)
