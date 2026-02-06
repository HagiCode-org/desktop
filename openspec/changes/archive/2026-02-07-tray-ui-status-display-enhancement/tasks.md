# Implementation Tasks

## Overview

This document outlines the implementation tasks for enhancing the system tray and home UI status display.

## Task List

### Phase 1: Internationalization Foundation

#### Task 1.1: Add Translation Keys (Chinese)
**File**: `src/renderer/i18n/locales/zh-CN/components.json`

Add the following translation keys under a new `tray` section:
- `tray.status.running`: "运行中"
- `tray.status.stopped`: "已停止"
- `tray.status.error`: "错误"
- `tray.openInApp`: "打开 Hagicode"
- `tray.openInBrowser`: "浏览器打开"
- `tray.startService`: "启动服务"
- `tray.stopService`: "停止服务"

**Acceptance Criteria**:
- All keys are added to the JSON file
- JSON structure is valid

#### Task 1.2: Add Translation Keys (English)
**File**: `src/renderer/i18n/locales/en-US/components.json`

Add the following translation keys under a new `tray` section:
- `tray.status.running`: "Running"
- `tray.status.stopped`: "Stopped"
- `tray.status.error`: "Error"
- `tray.openInApp`: "Open Hagicode"
- `tray.openInBrowser`: "Open in Browser"
- `tray.startService`: "Start Service"
- `tray.stopService`: "Stop Service"

**Acceptance Criteria**:
- All keys are added to the JSON file
- JSON structure is valid
- Keys match between Chinese and English versions

---

### Phase 2: Tray Enhancement

#### Task 2.1: Implement Dynamic Tray Status Display
**File**: `src/main/tray.ts`

**Changes Required**:
1. Update `updateTrayMenu()` to use status-based visual indicators
2. Add visual indicators (●/○) with color-coded status text
3. Implement dynamic menu item visibility based on status

**Implementation Details**:
```typescript
// Status display with visual indicators
const statusIndicator = serverStatus === 'running' ? '●' : serverStatus === 'stopped' ? '○' : '●';
const statusColor = serverStatus === 'running' ? 'green' : serverStatus === 'stopped' ? 'gray' : 'red';
```

**Acceptance Criteria**:
- Tray menu shows correct status indicator
- Status text updates dynamically
- Menu items enable/disable based on service state

#### Task 2.2: Add Open in App Button to Tray
**File**: `src/main/tray.ts`

**Changes Required**:
1. Add menu item "Open Hagicode"
2. Implement click handler to show/focus main window
3. Only show when service is running

**Acceptance Criteria**:
- Button appears only when service is running
- Clicking shows and focuses the main window
- Button uses translated text

#### Task 2.3: Add Open in Browser Button to Tray
**File**: `src/main/tray.ts`

**Changes Required**:
1. Add menu item "Open in Browser"
2. Implement click handler using `shell.openExternal()`
3. Only show when service is running
4. Get service URL from `webServiceManager.getStatus()`

**Acceptance Criteria**:
- Button appears only when service is running
- Clicking opens service URL in default browser
- Button uses translated text

#### Task 2.4: Implement Dynamic Start/Stop Buttons
**File**: `src/main/tray.ts`

**Changes Required**:
1. Conditionally show "Start Service" when stopped
2. Conditionally show "Stop Service" when running
3. Implement proper IPC calls to webServiceManager

**Acceptance Criteria**:
- Only one button visible at a time based on state
- Start button connects to webServiceManager.start()
- Stop button connects to webServiceManager.stop()

---

### Phase 3: Home Page Enhancement

#### Task 3.1: Add Open in App Button to Status Card
**File**: `src/renderer/components/WebServiceStatusCard.tsx`

**Changes Required**:
1. Add new button "Open Hagicode" next to existing buttons
2. Only show when service is running
3. Implement handler to show main window (if hidden)

**Acceptance Criteria**:
- Button appears only when service is running
- Button uses translated text from `t('tray.openInApp')`
- Proper icon (e.g., Monitor icon from lucide-react)

#### Task 3.2: Update Open in Browser Button
**File**: `src/renderer/components/WebServiceStatusCard.tsx`

**Current State**: Button exists as "Open in Browser"

**Changes Required**:
1. Update translation key to use `t('tray.openInBrowser')`
2. Ensure button appears alongside "Open Hagicode" button

**Acceptance Criteria**:
- Both open buttons visible when running
- Consistent translation namespace usage

---

### Phase 4: IPC Integration

#### Task 4.1: Add IPC Handler for Service URL
**File**: `src/main/main.ts`

**Changes Required**:
1. Add `ipcMain.handle('get-service-url')` handler
2. Return current service URL from webServiceManager
3. Return null if service is not running

**Acceptance Criteria**:
- Handler returns correct URL when running
- Returns null when stopped or in error state

#### Task 4.2: Update Main Process Status Sync
**File**: `src/main/main.ts`

**Changes Required**:
1. Ensure `setServerStatus()` is called when service state changes
2. Sync webServiceManager status to tray status

**Acceptance Criteria**:
- Tray status updates immediately on service state change
- No race conditions in status updates

---

### Phase 5: Testing & Validation

#### Task 5.1: Manual Testing - Windows
**Test Cases**:
- Install application on Windows
- Verify tray icon appears
- Start service and verify "● Running" status
- Stop service and verify "○ Stopped" status
- Test "Open Hagicode" button
- Test "Open in Browser" button
- Verify dynamic button switching

#### Task 5.2: Manual Testing - macOS
**Test Cases**:
- Install application on macOS
- Verify tray icon appears (menu bar)
- Start service and verify "● Running" status
- Stop service and verify "○ Stopped" status
- Test "Open Hagicode" button
- Test "Open in Browser" button
- Verify dynamic button switching

#### Task 5.3: Manual Testing - Linux
**Test Cases**:
- Install application on Linux
- Verify tray icon appears (appindicator)
- Start service and verify "● Running" status
- Stop service and verify "○ Stopped" status
- Test "Open Hagicode" button
- Test "Open in Browser" button
- Verify dynamic button switching

#### Task 5.4: Internationalization Testing
**Test Cases**:
- Switch language to Chinese
- Verify all new keys display correctly
- Switch language to English
- Verify all new keys display correctly

---

## Dependencies

### External Dependencies
- None (uses existing Electron APIs)

### Internal Dependencies
- `webServiceManager` - for service status and URL
- Redux store - for renderer state management
- i18n system - for translations

### Task Dependencies
```
Phase 1 (i18n) ──────────┐
                          ├──> Phase 4 (IPC) ──> Phase 5 (Testing)
Phase 2 (Tray) ───────────┤
                          │
Phase 3 (Home Page) ──────┘
```

## Estimated Effort

| Phase | Tasks | Estimated Complexity |
|-------|-------|---------------------|
| Phase 1 | 2 tasks | Low |
| Phase 2 | 4 tasks | Medium |
| Phase 3 | 2 tasks | Low |
| Phase 4 | 2 tasks | Medium |
| Phase 5 | 4 tasks | Medium |

## Rollout Plan

1. Implement Phase 1 (translation keys)
2. Implement Phase 2 (tray enhancements)
3. Implement Phase 3 (home page enhancements)
4. Implement Phase 4 (IPC integration)
5. Execute Phase 5 (testing on all platforms)
6. Deploy to production after successful testing
