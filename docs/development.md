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

Desktop-hosted Hagicode Server startup now uses a bundled `dotnet` runtime instead of `start.ps1` / `start.sh`. Packaging expects the staged runtime layout below before `electron-builder` runs:

```
build/embedded-runtime/current/
??? dotnet/
    ??? <platform>/
        ??? dotnet[.exe]
        ??? host/fxr/<version>/...
        ??? shared/Microsoft.NETCore.App/<version>/...
        ??? shared/Microsoft.AspNetCore.App/<version>/...
```

### Preparing the staged runtime

- Run `npm run prepare:runtime` from `repos/hagicode-desktop`.
- On Windows, use `npm run dev:embedded-runtime` to prepare the runtime and launch Desktop with `HAGICODE_EMBEDDED_DOTNET_ROOT` set automatically.
- The helper resolves its source from `HAGICODE_EMBEDDED_DOTNET_SOURCE`, then `DOTNET_ROOT`, then the locally installed `dotnet` location.
- `electron-builder.yml` ships `build/embedded-runtime/current/dotnet` through `extraResources`, so the packaged runtime is always outside `app.asar`.

### Local verification override

When running the unpackaged Electron app, point Desktop at the staged runtime with:

```powershell
$env:HAGICODE_EMBEDDED_DOTNET_ROOT = "$PWD/build/embedded-runtime/current/dotnet/win-x64"
npm run dev
```

Packaged builds ignore this override and always resolve the runtime from `process.resourcesPath/dotnet/<platform>`. Desktop does not fall back to a machine-wide `dotnet` installation when that packaged runtime is missing.

### Troubleshooting

#### Runtime staging or startup failures

1. Re-run `npm run prepare:runtime` and confirm the staged directory contains `dotnet[.exe]`, `host/fxr`, `shared/Microsoft.NETCore.App`, and `shared/Microsoft.AspNetCore.App`.
2. Check `npm run smoke-test -- --require-runtime` before packaging.
3. If Desktop reports `Invalid service payload`, verify the server package still contains `lib/PCode.Web.dll`, `lib/PCode.Web.runtimeconfig.json`, and `lib/PCode.Web.deps.json`.
4. If Desktop reports `Bundled runtime version incompatible`, compare the packaged ASP.NET Core version with `PCode.Web.runtimeconfig.json` and the manifest `dependencies.dotnet.version.runtime` metadata.

#### Service is running but UI shows stopped

1. Verify `runtime.port` matches expected port in `web-service.json`.
2. Check `http://localhost:<port>/api/health` returns `200`.
3. Confirm process command line contains `dotnet` and `PCode.Web.dll`.
4. Restart desktop to rerun full recovery flow.

#### UI shows running but service is unavailable

1. Confirm `runtime.pid` still exists.
2. Confirm the port is bound by the expected target process.
3. Stop service from desktop UI to trigger runtime state invalidation.
4. If needed, remove `<userData>/config/web-service.json` and relaunch.

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
