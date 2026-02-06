# Implementation Tasks

## 1. Main Process - Package Source Abstraction

- [ ] 1.1 Create `src/main/package-source.ts` module
- [ ] 1.2 Define `PackageSource` interface with methods:
  - `fetchPackage(version: string): Promise<PackageMetadata>`
  - `downloadPackage(version: string, targetPath: string): Promise<void>`
  - `listAvailableVersions(): Promise<string[]>`
- [ ] 1.3 Define `PackageSourceConfig` interface for source configuration
- [ ] 1.4 Define `PackageMetadata` interface for package information
- [ ] 1.5 Add TypeScript types for all source types

## 2. Main Process - Folder Package Source Implementation

- [ ] 2.1 Implement `FolderPackageSource` class
- [ ] 2.2 Implement `listAvailableVersions()` by scanning directory for .zip files
- [ ] 2.3 Implement `downloadPackage()` by copying file from local path
- [ ] 2.4 Implement `fetchPackage()` to read package metadata from filename
- [ ] 2.5 Add error handling for missing directory or files
- [ ] 2.6 Add logging with electron-log

## 3. Main Process - GitHub Release Package Source Implementation

- [ ] 3.1 Implement `GitHubReleasePackageSource` class
- [ ] 3.2 Implement `listAvailableVersions()` using GitHub Releases API
- [ ] 3.3 Implement GitHub API authentication (optional token)
- [ ] 3.4 Implement `downloadPackage()` by downloading release asset
- [ ] 3.5 Add download progress tracking
- [ ] 3.6 Filter releases to only include nort packages
- [ ] 3.7 Handle GitHub API rate limiting
- [ ] 3.8 Add error handling for network failures
- [ ] 3.9 Add logging with electron-log

## 4. Main Process - HTTP Package Source Implementation

- [ ] 4.1 Implement `HttpPackageSource` class
- [ ] 4.2 Implement `listAvailableVersions()` by parsing URL
- [ ] 4.3 Implement `downloadPackage()` using axios
- [ ] 4.4 Add download progress tracking
- [ ] 4.5 Handle HTTP errors and retries
- [ ] 4.6 Validate URL format
- [ ] 4.7 Add checksum verification if available
- [ ] 4.8 Add error handling for network failures
- [ ] 4.9 Add logging with electron-log

## 5. Main Process - Package Manager Refactoring

- [ ] 5.1 Refactor `PCodePackageManager` to accept `PackageSource` interface
- [ ] 5.2 Add `setPackageSource(source: PackageSource)` method
- [ ] 5.3 Update `installPackage()` to use source interface
- [ ] 5.4 Update `getAvailableVersions()` to use source interface
- [ ] 5.5 Add nort package validation in `verifyInstallation()`
- [ ] 5.6 Add nort-only notice/error messages
- [ ] 5.7 Ensure backward compatibility with folder source
- [ ] 5.8 Add unit tests for refactored code

## 6. Main Process - IPC Communication Layer

- [ ] 6.1 Add `package:create-source` IPC handler
- [ ] 6.2 Add `package:get-versions` IPC handler
- [ ] 6.3 Add `package:install-from-source` IPC handler
- [ ] 6.4 Add `package:validate-source-config` IPC handler
- [ ] 6.5 Handle errors and return appropriate error messages
- [ ] 6.6 Add source configuration persistence using electron-store

## 7. Preload Script - API Exposure

- [ ] 7.1 Add `createPackageSource()` to preload API
- [ ] 7.2 Add `getAvailableVersionsFromSource()` to preload API
- [ ] 7.3 Add `installPackageFromSource()` to preload API
- [ ] 7.4 Add `validateSourceConfig()` to preload API
- [ ] 7.5 Update TypeScript types in `Window.electronAPI` interface

## 8. Renderer - Package Source Config Component

- [ ] 8.1 Create `src/renderer/components/PackageSourceConfig.tsx`
- [ ] 8.2 Implement source type selector (dropdown)
- [ ] 8.3 Implement folder source configuration form
- [ ] 8.4 Add folder path input with browse button
- [ ] 8.5 Implement GitHub Release configuration form
- [ ] 8.6 Add owner/repo inputs
- [ ] 8.7 Add optional token input for private repos
- [ ] 8.8 Implement HTTP source configuration form
- [ ] 8.9 Add URL input with validation
- [ ] 8.10 Add "Fetch Versions" / "Scan" button
- [ ] 8.11 Show loading state during source operations
- [ ] 8.12 Display error messages for configuration failures

## 9. Renderer - Package Management Card Integration

- [ ] 9.1 Import `PackageSourceConfig` in `PackageManagementCard.tsx`
- [ ] 9.2 Add source configuration section above version selector
- [ ] 9.3 Update version selector to use source-based version list
- [ ] 9.4 Add nort-only notice banner
- [ ] 9.5 Handle source configuration changes
- [ ] 9.6 Persist source configuration in store
- [ ] 9.7 Update installation flow to use source API
- [ ] 9.8 Add progress indicator for download operations

## 10. Renderer - State Management

- [ ] 10.1 Add `packageSource` slice to Redux store
- [ ] 10.2 Add actions for source configuration
- [ ] 10.3 Add actions for fetching versions from source
- [ ] 10.4 Add actions for installing from source
- [ ] 10.5 Implement sagas for async source operations
- [ ] 10.6 Handle loading states
- [ ] 10.7 Handle error states
- [ ] 10.8 Add selectors for source state

## 11. Internationalization

- [ ] 11.1 Add Chinese translation keys in `src/renderer/i18n/locales/zh-CN/pages.json`:
  - `package.sourceType.label`
  - `package.sourceType.folder`
  - `package.sourceType.github`
  - `package.sourceType.http`
  - `package.nortOnlyNotice`
  - `package.sourceConfig.folder.path`
  - `package.sourceConfig.github.owner`
  - `package.sourceConfig.github.repo`
  - `package.sourceConfig.github.token`
  - `package.sourceConfig.http.url`
  - `package.sourceConfig.fetchVersions`
  - `package.sourceConfig.scanFolder`
  - `package.sourceConfig.error.invalidPath`
  - `package.sourceConfig.error.invalidRepo`
  - `package.sourceConfig.error.invalidUrl`

- [ ] 11.2 Add English translation keys in `src/renderer/i18n/locales/en-US/pages.json`
- [ ] 11.3 Test language switching functionality

## 12. Testing - Main Process

- [ ] 12.1 Test folder source with valid directory
- [ ] 12.2 Test folder source with invalid directory
- [ ] 12.3 Test folder source with no packages
- [ ] 12.4 Test GitHub source with public repository
- [ ] 12.5 Test GitHub source with authentication token
- [ ] 12.6 Test GitHub source with invalid repository
- [ ] 12.7 Test GitHub source API rate limiting
- [ ] 12.8 Test HTTP source with valid URL
- [ ] 12.9 Test HTTP source with invalid URL
- [ ] 12.10 Test HTTP source with network failure
- [ ] 12.11 Test nort package validation
- [ ] 12.12 Test non-nort package rejection

## 13. Testing - UI Integration

- [ ] 13.1 Test source type switching
- [ ] 13.2 Test folder source configuration and version fetching
- [ ] 13.3 Test GitHub source configuration and version fetching
- [ ] 13.4 Test HTTP source configuration
- [ ] 13.5 Test installation from folder source
- [ ] 13.6 Test installation from GitHub source
- [ ] 13.7 Test installation from HTTP source
- [ ] 13.8 Test nort-only notice display
- [ ] 13.9 Test error messages display
- [ ] 13.10 Test loading states
- [ ] 13.11 Test source configuration persistence

## 14. Testing - Cross-Platform

- [ ] 14.1 Test on Linux platform
- [ ] 14.2 Test on Windows platform (if accessible)
- [ ] 14.3 Test on macOS platform (if accessible)
- [ ] 14.4 Test platform-specific package filtering
- [ ] 14.5 Test file permissions across platforms

## 15. Documentation

- [ ] 15.1 Create `specs/package-management/spec.md` with requirements
- [ ] 15.2 Update `specs/electron-app/spec.md` with UI requirements
- [ ] 15.3 Add inline code comments for complex logic
- [ ] 15.4 Document nort package validation logic
- [ ] 15.5 Document GitHub API authentication flow
- [ ] 15.6 Document error handling strategies
- [ ] 15.7 Update README with new features (if needed)
