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
- **URL**: `https://server.dl.hagicode.com/index.json`
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

## Environment Variables

### Application-Level Variables

- `NODE_ENV`: Set to `development` for development mode
- `HAGICO_CONFIG_PATH`: Optional path to configuration directory
- `UPDATE_SOURCE_OVERRIDE`: Override default update source (see above)

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
  - `lastSuccessfulPort`
  - `savedAt`
- Runtime recovery fields:
  - `runtime.pid`
  - `runtime.port`
  - `runtime.startedAt`
  - `runtime.versionId`
  - `runtime.recoverySource`
  - `runtime.recoveryMessage`
  - `runtime.updatedAt`

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

The desktop app now resolves Smart Config and Diagnosis prompt files through a shared resolver.

### Resource Keys and Target Files

- `smartConfig` -> `config/config-prompt.llm.txt`
- `diagnosis` -> `scripts/diagnosis-prompt.llm.txt`

### Resolution Order

For both entry points, path lookup follows this order:

1. Active installed version directory (`apps/installed/<activeVersionId>/...`)
2. Packaged resource locations (`process.resourcesPath`, `app.asar.unpacked`, `app.getAppPath()`)
3. Development fallback (`process.cwd()`, development root)

### Structured Diagnostic Fields

When prompt resolution fails, IPC responses include:

- `errorCode`: stable category (`PROMPT_NOT_FOUND`, `INVALID_PROMPT_PATH`, etc.)
- `resourceKey`: requested resource (`smartConfig` or `diagnosis`)
- `attemptedPaths`: ordered candidate path list that was checked
- `activeVersion`: active version id at lookup time (if available)

These fields are intended for troubleshooting and can be surfaced in UI or logs.

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
