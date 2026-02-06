# Implementation Tasks

## Backend Tasks

### Task 1: PathManager - Add getLogsPath Method
**File**: `src/main/path-manager.ts`

Add a method to get the logs path for a specific version:

```typescript
/**
 * Get logs directory path for an installed version
 * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
 * @returns Path to the version's logs directory
 */
getLogsPath(versionId: string): string {
  return path.join(this.paths.appsInstalled, versionId, 'lib', 'logs');
}
```

**Acceptance Criteria**:
- Method returns correct path for any version ID
- Path follows structure: `<userData>/apps/installed/<versionId>/lib/logs/`

---

### Task 2: Main Process - Add open-logs-folder IPC Handler
**File**: `src/main/main.ts`

Add IPC handler to open logs folder:

```typescript
ipcMain.handle('version:openLogs', async (_, versionId: string) => {
  if (!versionManager) {
    return {
      success: false,
      error: 'Version manager not initialized'
    };
  }

  try {
    // Get logs path
    const logsPath = versionManager.pathManager.getLogsPath(versionId);

    // Check if logs directory exists
    try {
      await fs.access(logsPath);
    } catch {
      log.warn('[Main] Logs directory not found:', logsPath);
      return {
        success: false,
        error: 'logs_not_found'
      };
    }

    // Open the folder in system file manager
    await shell.openPath(logsPath);
    log.info('[Main] Opened logs folder:', logsPath);

    return { success: true };
  } catch (error) {
    log.error('[Main] Failed to open logs folder:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
```

**Acceptance Criteria**:
- Handler checks if logs directory exists before opening
- Returns success/failure status with appropriate error codes
- Logs all operations for debugging

---

## Frontend Tasks

### Task 3: Preload - Add versionOpenLogs API
**File**: `src/preload/index.ts`

Add API to preload script:

```typescript
// In the electronAPI object
versionOpenLogs: (versionId: string) => ipcRenderer.invoke('version:openLogs', versionId),
```

**Acceptance Criteria**:
- API is exposed in `window.electronAPI.versionOpenLogs`
- Returns `{ success: boolean; error?: string }`

---

### Task 4: VersionManagementPage - Add Open Logs Button
**File**: `src/renderer/components/VersionManagementPage.tsx`

Add the "Open Logs" button to the version action buttons:

1. Import `FolderOpen` icon from lucide-react
2. Add `versionOpenLogs` to the `Window` interface
3. Add `handleOpenLogs` function:

```typescript
const handleOpenLogs = async (versionId: string) => {
  try {
    const result = await window.electronAPI.versionOpenLogs(versionId);

    if (result.success) {
      toast.success(t('versionManagement.toast.openLogsSuccess'));
    } else {
      if (result.error === 'logs_not_found') {
        toast.error(t('versionManagement.toast.logsNotFound'));
      } else {
        toast.error(t('versionManagement.toast.openLogsError'));
      }
    }
  } catch (error) {
    console.error('Error opening logs folder:', error);
    toast.error(t('versionManagement.toast.openLogsError'));
  }
};
```

4. Add button to the action buttons area (after "Reinstall" button, before "Switch" or "Uninstall"):

```typescript
<button
  onClick={() => handleOpenLogs(version.id)}
  className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors flex items-center gap-1.5"
  title={t('versionManagement.actions.openLogs')}
>
  <FolderOpen className="w-4 h-4" />
  {t('versionManagement.actions.openLogs')}
</button>
```

**Acceptance Criteria**:
- Button is only shown for installed versions
- Button opens logs folder in system file manager
- Appropriate error messages are shown via Toast

---

### Task 4b: WebServiceStatusCard - Add Open Logs Button
**File**: `src/renderer/components/WebServiceStatusCard.tsx`

Add the "Open Logs" button to the home page service status card:

1. Import `FolderOpen` icon from lucide-react
2. Add `versionOpenLogs` to the `Window` interface (if not already added)
3. Add `handleOpenLogs` function:

```typescript
const handleOpenLogs = async () => {
  if (!activeVersion) {
    toast.error(t('webServiceStatus.toast.noActiveVersion'));
    return;
  }

  try {
    const result = await window.electronAPI.versionOpenLogs(activeVersion.id);

    if (result.success) {
      toast.success(t('webServiceStatus.toast.openLogsSuccess'));
    } else {
      if (result.error === 'logs_not_found') {
        toast.error(t('webServiceStatus.toast.logsNotFound'));
      } else {
        toast.error(t('webServiceStatus.toast.openLogsError'));
      }
    }
  } catch (error) {
    console.error('Error opening logs folder:', error);
    toast.error(t('webServiceStatus.toast.openLogsError'));
  }
};
```

4. Add button to the secondary controls area (after Restart/Stop buttons, or in the service details section):

```typescript
{/* Open Logs Button - only when active version exists */}
{activeVersion && (
  <motion.div
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    <Button
      onClick={handleOpenLogs}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <FolderOpen className="w-4 h-4" />
      {t('webServiceStatus.openLogsButton')}
    </Button>
  </motion.div>
)}
```

**Acceptance Criteria**:
- Button is only shown when an active version exists
- Button opens logs folder in system file manager
- Appropriate error messages are shown via Toast
- Button is placed appropriately in the UI (secondary controls area)

---

## Internationalization Tasks

### Task 5a: English Translations - Version Management
**File**: `src/renderer/i18n/locales/en-US/pages.json`

Add to `versionManagement.actions`:
```json
"openLogs": "Open Logs"
```

Add to `versionManagement.toast`:
```json
"openLogsSuccess": "Logs folder opened",
"logsNotFound": "Logs folder not found",
"openLogsError": "Failed to open logs folder"
```

---

### Task 5b: English Translations - Web Service Status
**File**: `src/renderer/i18n/locales/en-US/components.json`

Add to `webServiceStatus`:
```json
"openLogsButton": "Open Logs"
```

Add to `webServiceStatus.toast`:
```json
"noActiveVersion": "No active version",
"openLogsSuccess": "Logs folder opened",
"logsNotFound": "Logs folder not found",
"openLogsError": "Failed to open logs folder"
```

---

### Task 6a: Chinese Translations - Version Management
**File**: `src/renderer/i18n/locales/zh-CN/pages.json`

Add to `versionManagement.actions`:
```json
"openLogs": "打开日志"
```

Add to `versionManagement.toast`:
```json
"openLogsSuccess": "日志文件夹已打开",
"logsNotFound": "日志文件夹不存在",
"openLogsError": "无法打开日志文件夹"
```

---

### Task 6b: Chinese Translations - Web Service Status
**File**: `src/renderer/i18n/locales/zh-CN/components.json`

Add to `webServiceStatus`:
```json
"openLogsButton": "打开日志"
```

Add to `webServiceStatus.toast`:
```json
"noActiveVersion": "没有激活的版本",
"openLogsSuccess": "日志文件夹已打开",
"logsNotFound": "日志文件夹不存在",
"openLogsError": "无法打开日志文件夹"
```

---

## Testing Tasks

### Task 7: Manual Testing

**Test Scenario 1: Logs folder exists (Version Management Page)**
1. Install a version that has logs folder
2. Go to Version Management page
3. Click "Open Logs" button on an installed version
4. Verify file manager opens to the correct logs directory
5. Verify success toast is shown

**Test Scenario 2: Logs folder does not exist (Version Management Page)**
1. Manually delete logs folder for an installed version
2. Go to Version Management page
3. Click "Open Logs" button
4. Verify error toast is shown with "logs not found" message

**Test Scenario 3: Logs folder exists (Home Page)**
1. Install a version that has logs folder and activate it
2. Go to Home page (WebServiceStatusCard)
3. Click "Open Logs" button
4. Verify file manager opens to the correct logs directory
5. Verify success toast is shown

**Test Scenario 4: No active version (Home Page)**
1. Uninstall all versions or ensure no active version
2. Go to Home page (WebServiceStatusCard)
3. Verify "Open Logs" button is not shown
4. (If button is shown) Click and verify error toast

**Test Scenario 5: Cross-platform testing**
- Test on Windows: verify File Explorer opens
- Test on macOS: verify Finder opens
- Test on Linux: verify default file manager opens

---

## Task Dependencies

```
Task 1 (PathManager)
    ↓
Task 2 (IPC Handler)
    ↓
Task 3 (Preload API)
    ↓
Task 4a (VersionManagementPage Button) ─────┐
    ↓                                      │
Task 4b (WebServiceStatusCard Button) ─────┤
    ↓                                      ↓
Task 5a & 5b (English i18n) ────────────────┤
    ↓                                      │
Task 6a & 6b (Chinese i18n) ────────────────┘
    ↓
Task 7 (Testing)
```

**Parallelizable**:
- Task 4a and Task 4b can be done in parallel after Task 3
- Task 5a and Task 5b can be done in parallel
- Task 6a and Task 6b can be done in parallel
- Task 2 and Task 3 can be started after Task 1 is done

---

## Completion Criteria

### Backend
- [ ] PathManager.getLogsPath() method implemented
- [ ] IPC handler added in main.ts with error handling
- [ ] Preload API exposed in window.electronAPI

### Frontend
- [ ] "Open Logs" button added to VersionManagementPage
- [ ] "Open Logs" button added to WebServiceStatusCard (home page)
- [ ] Toast notifications for success/error states

### Internationalization
- [ ] English translations added for VersionManagementPage
- [ ] English translations added for WebServiceStatusCard
- [ ] Chinese translations added for VersionManagementPage
- [ ] Chinese translations added for WebServiceStatusCard

### Testing
- [ ] Manual testing completed on VersionManagementPage
- [ ] Manual testing completed on WebServiceStatusCard
- [ ] Cross-platform testing (Windows/macOS/Linux) completed
- [ ] Build passes with no TypeScript errors
