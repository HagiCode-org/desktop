# Implementation Tasks

## 1. Main Process - Manifest Reader Module

- [ ] 1.1 Create `src/main/manifest-reader.ts` module
- [ ] 1.2 Implement `readManifest(installPath: string): Promise<Manifest>` function
- [ ] 1.3 Implement `parseDependencies(manifest: Manifest): ParsedDependency[]` function
- [ ] 1.4 Implement `parseVersionInfo(manifest: Manifest): VersionInfo` function
- [ ] 1.5 Add TypeScript interfaces for Manifest structure (matching YAML schema)
- [ ] 1.6 Handle missing or invalid manifest.yaml gracefully
- [ ] 1.7 Add unit tests for manifest parsing

## 2. Main Process - Version Provider Interface

- [ ] 2.1 Define `VersionProvider` interface (scan, download, getMetadata)
- [ ] 2.2 Implement `FileSystemVersionProvider` for local file system scanning
- [ ] 2.3 Implement `RemoteRepositoryVersionProvider` for remote repository
- [ ] 2.4 Implement `GitRepositoryVersionProvider` for Git-based version sources
- [ ] 2.5 Add version caching mechanism
- [ ] 2.6 Implement version comparison using `semver` library

## 3. Main Process - Version Manager

- [ ] 3.1 Create `src/main/version-manager.ts` module
- [ ] 3.2 Implement `listVersions(): Promise<Version[]>` method
- [ ] 3.3 Implement `installVersion(versionId: string): Promise<InstallResult>` method
- [ ] 3.4 Implement `uninstallVersion(versionId: string): Promise<void>` method
- [ ] 3.5 Implement `switchVersion(versionId: string): Promise<void>` method
- [ ] 3.6 Integrate with ManifestReader for dependency extraction
- [ ] 3.7 Integrate with DependencyManager for dependency checking
- [ ] 3.8 Persist version state to electron-store

## 4. Main Process - Package Manager Enhancement

- [ ] 4.1 Add download progress callback support
- [ ] 4.2 Implement checksum verification for downloaded packages
- [ ] 4.3 Add post-install script execution
- [ ] 4.4 Integrate automatic dependency check after installation
- [ ] 4.5 Update electron-store schema to include `installedVersions`

## 5. Main Process - Dependency Manager Enhancement

- [ ] 5.1 Add `checkFromManifest(dependencies: ParsedDependency[]): Promise<DependencyCheckResult[]>` method
- [ ] 5.2 Implement exact version check for `exact` version constraints
- [ ] 5.3 Implement version range check for `min`/`max` constraints
- [ ] 5.4 Add support for checking npm global packages
- [ ] 5.5 Map manifest dependency types to existing `DependencyType` enum

## 6. IPC Communication Layer

- [ ] 6.1 Add `version:list` IPC handler in main process
- [ ] 6.2 Add `version:install` IPC handler in main process
- [ ] 6.3 Add `version:uninstall` IPC handler in main process
- [ ] 6.4 Add `version:switch` IPC handler in main process
- [ ] 6.5 Add `version:checkDependencies` IPC handler in main process
- [ ] 6.6 Add `version:getInstalledVersions` IPC handler in main process
- [ ] 6.7 Expose version management APIs in preload script
- [ ] 6.8 Add TypeScript types to `Window.electronAPI` interface

## 7. Renderer - Version Management Page

- [ ] 7.1 Implement version list display with available versions
- [ ] 7.2 Implement installed versions display with status indicators
- [ ] 7.3 Add install button and progress indicator
- [ ] 7.4 Add uninstall and switch version functionality
- [ ] 7.5 Integrate `DependencyCheckCard` component
- [ ] 7.6 Implement loading states during version operations
- [ ] 7.7 Handle error states gracefully
- [ ] 7.8 Style with Tailwind CSS matching existing design

## 8. Renderer - Dependency Check Card Enhancement

- [ ] 8.1 Modify `DependencyCheckCard` to accept version context
- [ ] 8.2 Add "Install" button functionality for missing dependencies
- [ ] 8.3 Add auto-refresh after dependency installation
- [ ] 8.4 Update styling to fit within version management page

## 9. Renderer - Sidebar Navigation Update

- [ ] 9.1 Remove "dependencyManagement" from `navigationItems` array
- [ ] 9.2 Update view type definitions (if necessary)
- [ ] 9.3 Test navigation flow with reduced menu items

## 10. Renderer - Dashboard Integration

- [ ] 10.1 Add current active version display in `SystemManagementView`
- [ ] 10.2 Add version status indicator (ready/incomplete)
- [ ] 10.3 Implement enable condition check based on version dependencies
- [ ] 10.4 Show "Install Dependencies" prompt when version is incomplete
- [ ] 10.5 Add navigation button to version management page

## 11. Renderer - Redux State Management

- [ ] 11.1 Create `versionSlice` in Redux store (if needed)
- [ ] 11.2 Define actions: `fetchVersions`, `installVersion`, `checkDependencies`
- [ ] 11.3 Define state: `versions`, `installedVersions`, `currentVersion`
- [ ] 11.4 Create sagas for async version operations

## 12. Internationalization

- [ ] 12.1 Add Chinese translation keys in `src/renderer/i18n/locales/zh-CN/pages.json`
  - [ ] 12.1.1 Version management page translations
  - [ ] 12.1.2 Dependency status translations
  - [ ] 12.1.3 Installation progress translations
- [ ] 12.2 Add English translation keys in `src/renderer/i18n/locales/en-US/pages.json`
  - [ ] 12.2.1 Version management page translations
  - [ ] 12.2.2 Dependency status translations
  - [ ] 12.2.3 Installation progress translations
- [ ] 12.3 Remove "dependencyManagement" from `src/renderer/i18n/locales/zh-CN/common.json`
- [ ] 12.4 Remove "dependencyManagement" from `src/renderer/i18n/locales/en-US/common.json`

## 13. Data Migration

- [ ] 13.1 Design `installedVersions` electron-store schema
- [ ] 13.2 Implement migration logic for existing configuration data
- [ ] 13.3 Add data migration script in main process startup
- [ ] 13.4 Test migration with various configuration states

## 14. Testing

- [ ] 14.1 Unit tests for Manifest Reader
- [ ] 14.2 Unit tests for Version Provider implementations
- [ ] 14.3 Unit tests for Version Manager
- [ ] 14.4 Integration test: complete version installation flow
- [ ] 14.5 Integration test: dependency check after installation
- [ ] 14.6 UI test: version management page interactions
- [ ] 14.7 UI test: dependency card display and actions
- [ ] 14.8 Test on Linux platform
- [ ] 14.9 Test on Windows platform (if accessible)
- [ ] 14.10 Test on macOS platform (if accessible)
- [ ] 14.11 Test data migration from old configuration

## 15. Documentation

- [ ] 15.1 Update OpenSpec spec for `dependency-management`
- [ ] 15.2 Update OpenSpec spec for `electron-app`
- [ ] 15.3 Add inline code comments for complex logic
- [ ] 15.4 Document manifest.yaml schema requirements
- [ ] 15.5 Document version provider extension guide
- [ ] 15.6 Update user manual for version management feature

## 16. User Experience Enhancement

- [ ] 16.1 Add first-run notification about menu reorganization
- [ ] 16.2 Add dismissible hint in version management page
- [ ] 16.3 Implement keyboard shortcuts for version actions
- [ ] 16.4 Add loading skeletons for better perceived performance
- [ ] 16.5 Add success/error notifications for version operations

## 17. Security & Validation

- [ ] 17.1 Implement checksum verification for downloaded packages
- [ ] 17.2 Add HTTPS certificate validation for remote repositories
- [ ] 17.3 Implement permission checks for installation commands
- [ ] 17.4 Add user confirmation for destructive operations (uninstall)
- [ ] 17.5 Validate manifest.yaml schema before parsing

## 18. Performance Optimization

- [ ] 18.1 Implement version list caching
- [ ] 18.2 Parallelize dependency checks
- [ ] 18.3 Optimize electron-store read/write operations
- [ ] 18.4 Add lazy loading for version details
- [ ] 18.5 Implement debouncing for refresh operations
