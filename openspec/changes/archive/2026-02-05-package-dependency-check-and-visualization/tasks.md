# Implementation Tasks

## 1. Main Process - Manifest Reader Module

- [ ] 1.1 Create `src/main/manifest-reader.ts` module
- [ ] 1.2 Implement `readManifest(installPath: string): Promise<Manifest>` function
- [ ] 1.3 Implement `parseDependencies(manifest: Manifest): ParsedDependency[]` function
- [ ] 1.4 Add TypeScript interfaces for Manifest structure (matching schema v1)
- [ ] 1.5 Handle missing or invalid manifest.json gracefully
- [ ] 1.6 Add unit tests for manifest parsing

## 2. Main Process - Dependency Manager Enhancement

- [ ] 2.1 Add `checkFromManifest(dependencies: ParsedDependency[]): Promise<DependencyCheckResult[]>` method
- [ ] 2.2 Implement exact version check for `exact` version constraints
- [ ] 2.3 Implement version range check for `min`/`max` constraints
- [ ] 2.4 Add support for checking Node.js runtime via `node --version`
- [ ] 2.5 Add support for checking NPM version via `npm --version`
- [ ] 2.6 Map manifest dependency types to existing `DependencyType` enum
- [ ] 2.7 Handle special case: .NET runtime version check for `10.0.0+`

## 3. Main Process - Package Manager Integration

- [ ] 3.1 Modify `installPackage()` to trigger dependency check after successful installation
- [ ] 3.2 Add `getPackageDependencies(): Promise<DependencyCheckResult[]>` method
- [ ] 3.3 Store dependency check results in memory for quick access
- [ ] 3.4 Emit IPC event when dependencies are checked

## 4. IPC Communication Layer

- [ ] 4.1 Add `getPackageDependencies` IPC handler in main process
- [ ] 4.2 Expose `getPackageDependencies()` in preload script
- [ ] 4.3 Add TypeScript types to `Window.electronAPI` interface
- [ ] 4.4 Test IPC communication between main and renderer

## 5. Renderer - Dependency Check Card Component

- [ ] 5.1 Create `src/renderer/components/DependencyCheckCard.tsx`
- [ ] 5.2 Implement dependency list display with status icons
- [ ] 5.3 Add "Refresh" button functionality
- [ ] 5.4 Add "Install" button for missing dependencies
- [ ] 5.5 Add "Download" button linking to official sources
- [ ] 5.6 Implement loading state during dependency check
- [ ] 5.7 Handle empty state (no package installed)
- [ ] 5.8 Style with Tailwind CSS matching existing design

## 6. Renderer - System Management View Integration

- [ ] 6.1 Import `DependencyCheckCard` in `SystemManagementView.tsx`
- [ ] 6.2 Add dependency card component below Web Service Status Card
- [ ] 6.3 Fetch dependencies on component mount
- [ ] 6.4 Handle dependency check errors gracefully
- [ ] 6.5 Add i18n keys for dependency-related text

## 7. Internationalization

- [ ] 7.1 Add Chinese translation keys in `src/renderer/i18n/locales/zh-CN/pages.json`
- [ ] 7.2 Add English translation keys in `src/renderer/i18n/locales/en-US/pages.json`
- [ ] 7.3 Add keys for: dependency status, actions, error messages
- [ ] 7.4 Test language switching functionality

## 8. Testing

- [ ] 8.1 Test with package containing valid manifest.json
- [ ] 8.2 Test with package missing manifest.json
- [ ] 8.3 Test with all dependencies installed
- [ ] 8.4 Test with some dependencies missing
- [ ] 8.5 Test version mismatch scenarios
- [ ] 8.6 Test install button functionality
- [ ] 8.7 Test on Linux platform
- [ ] 8.8 Test on Windows platform (if accessible)
- [ ] 8.9 Test on macOS platform (if accessible)

## 9. Documentation

- [ ] 9.1 Update OpenSpec spec for `dependency-management`
- [ ] 9.2 Add inline code comments for complex logic
- [ ] 9.3 Document manifest.json schema assumptions
