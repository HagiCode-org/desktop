# Development Guide

This document provides detailed information about developing and debugging HagiCode Desktop.

## Table of Contents

- [Update Source Configuration](#update-source-configuration)
- [Development Workflow](#development-workflow)
- [Environment Variables](#environment-variables)
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
- [OpenSpec Proposals](../openspec/README.md)
- [Project README](../README.md)
