# System Tray and Home UI Status Display Enhancement

## Summary

Enhance the system tray and home page UI to provide better visibility of the web service status, add dynamic button state management, and support dual opening methods (in-app window and system browser).

## Background

The Hagicode Desktop application currently has basic system tray integration and web service management. However, users lack clear visibility into service status and have limited options for accessing the running service.

### Current State
- System tray is integrated (Windows/macOS/Linux)
- Web service start/stop functionality is implemented
- Home page provides basic service control interface

## Problems

1. **Insufficient Status Visibility**: The tray doesn't clearly display the web service's current running status (running/stopped/error)
2. **Ambiguous Button States**: Start/stop buttons don't dynamically switch based on service state
3. **Limited Access Options**: No quick entry to open the running service in a browser
4. **Restricted Opening Methods**: Users cannot choose between opening the service in the Electron built-in window or system browser

## Proposed Solution

### 1. Enhanced Tray Status Display

**File**: `src/main/tray.ts`

Add service status indicators to the tray menu:
- When service is running: Display "● Running" or green icon
- When service is stopped: Display "○ Stopped" or gray icon
- When service has error: Display "● Error" or red icon

### 2. Dynamic Button State Management

**Files**:
- `src/main/tray.ts` - Tray menu
- `src/renderer/components/WebServiceStatusCard.tsx` - Home page component

Implement button state auto-switching based on service state:
- **When stopped**: Show "Start Service" button
- **When running**: Show "Stop Service" button

### 3. Dual Opening Method Support

Add two open buttons in **both tray menu** and **home page**:

| Button Name | Behavior | Implementation |
|------------|----------|----------------|
| **Open Hagicode** | Open in Electron built-in window | Use `BrowserWindow` to load local page |
| **Open in Browser** | Open in system default browser | Use `shell.openExternal()` or system `start` command |

### 4. Internationalization Support

**Files**:
- `src/renderer/i18n/locales/zh-CN/components.json`
- `src/renderer/i18n/locales/en-US/components.json`

Translation keys to add:
```json
{
  "tray": {
    "status": {
      "running": "Running",
      "stopped": "Stopped",
      "error": "Error"
    },
    "openInApp": "Open Hagicode",
    "openInBrowser": "Open in Browser",
    "startService": "Start Service",
    "stopService": "Stop Service"
  }
}
```

## Impact

### User Experience Improvements
- **Status Transparency**: Users can always know the service running status
- **Operation Efficiency**: Reduce clicks, quickly access the service
- **Flexibility**: Support multiple opening methods for different use cases

### Technical Implementation Scope

| Component | Change Type | Priority |
|-----------|-------------|----------|
| `tray.ts` | Add status display and dynamic menu | High |
| `WebServiceStatusCard.tsx` | Add dual open buttons | High |
| i18n files | Add new translation keys | Medium |
| Redux store | May need state enhancement | Medium |

### Risk Assessment
- **Low Risk**: UI-level enhancements, no impact on core service logic
- **Platform Compatibility**: Must ensure consistent tray menu behavior across Windows/macOS/Linux

## Alternatives Considered

1. **Status Icon Only**: Using only icon changes without text
   - Rejected: Text provides clearer status information

2. **Single Open Method**: Using only browser or only in-app
   - Rejected: Users need flexibility for different scenarios

3. **Context Menu Based**: Right-click for options
   - Rejected: Less discoverable than direct buttons

## Open Questions

None identified.

## Related Changes

None directly related. This is a standalone enhancement.
