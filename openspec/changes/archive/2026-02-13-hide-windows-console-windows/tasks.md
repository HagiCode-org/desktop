# Tasks: Hide Windows Console Windows During Batch Script Execution

## 1. Implementation

- [ ] 1.1 Update `dependency-manager.ts` - `executeEntryPointScript` method
  - Add `windowsHide: true` to spawn options when `platform === 'win32'` (around line 257)
  - Ensure the option is combined with existing `detached` setting

- [ ] 1.2 Update `dependency-manager.ts` - `executeCommandWithRealTimeOutput` method
  - Add `windowsHide: true` to spawn options when `platform === 'win32'` (around line 991)

- [ ] 1.3 Update `web-service-manager.ts` - `executeStartScript` method
  - Modify spawn call to include `windowsHide: true` OR refactor to use `getSpawnOptions()` (around line 235)

- [ ] 1.4 Update `web-service-manager.ts` - `forceKill` method
  - Add `windowsHide: true` to taskkill spawn call on Windows (around line 928)

- [ ] 1.5 Verify `getSpawnOptions` method consistency
  - Confirm `windowsHide: true` is set for Windows platform (line 341)
  - Ensure all code paths that spawn processes on Windows use this method or include the option

## 2. Testing

- [ ] 2.1 Manual testing on Windows environment
  - Test dependency check - verify no console window appears
  - Test dependency installation - verify no console window appears
  - Test web service start - verify no console window appears
  - Test onboarding flow end-to-end

- [ ] 2.2 Cross-platform verification
  - Verify macOS/Linux behavior is unchanged
  - Confirm no regression on Unix platforms

- [ ] 2.3 Edge cases
  - Test with paths containing spaces
  - Test with long-running scripts
  - Test with scripts that produce errors

## 3. Documentation

- [ ] 3.1 Update any relevant inline comments
  - Document the `windowsHide` option purpose
  - Note platform-specific behavior

## 4. Validation

- [ ] 4.1 Run `openspec validate hide-windows-console-windows --strict`
- [ ] 4.2 Ensure all TypeScript compilation passes
- [ ] 4.3 Verify no new linting errors
