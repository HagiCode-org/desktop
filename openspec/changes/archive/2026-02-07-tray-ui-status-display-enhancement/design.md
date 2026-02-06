# Design Document: System Tray and Home UI Status Display Enhancement

## Overview

This document provides detailed design specifications for enhancing the system tray and home page UI to display web service status, add dynamic button states, and support dual opening methods.

## Architecture

### Component Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process (Electron)                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌─────────────────┐                  │
│  │    Tray      │◄─────┤WebServiceManager│                  │
│  │   Module     │      │                 │                  │
│  └──────┬───────┘      └─────────────────┘                  │
│         │                                                      │
│         │ setServerStatus()                                   │
│         │ getStatus()                                         │
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────┐    │
│  │              IPC Handlers                            │    │
│  │  - get-service-url                                    │    │
│  │  - start-server                                       │    │
│  │  - stop-server                                        │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │ IPC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Renderer Process (React)                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Redux Store                             │   │
│  │  webServiceSlice: { status, url, pid, ... }         │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     WebServiceStatusCard Component                    │   │
│  │  - Status Badge                                       │   │
│  │  - Start/Stop Buttons (dynamic)                       │   │
│  │  - Open Hagicode Button                               │   │
│  │  - Open in Browser Button                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Detailed Design

### 1. Tray Module Design

#### 1.1 Status Display

**File**: `src/main/tray.ts`

**Current Implementation**:
```typescript
const statusText = serverStatus === 'running' ? 'Running' : serverStatus === 'stopped' ? 'Stopped' : 'Error';
```

**Enhanced Implementation**:
```typescript
interface TrayStatusConfig {
  indicator: string;
  color: string;  // Note: Electron menus don't support color, this is for future native icon support
  text: string;
}

const statusConfig: Record<string, TrayStatusConfig> = {
  running: {
    indicator: '●',
    color: 'green',
    text: 'Running'
  },
  stopped: {
    indicator: '○',
    color: 'gray',
    text: 'Stopped'
  },
  error: {
    indicator: '●',
    color: 'red',
    text: 'Error'
  }
};

const config = statusConfig[serverStatus];
const statusDisplay = `${config.indicator} ${config.text}`;
```

#### 1.2 Menu Structure

**Proposed Menu Layout**:
```
┌─────────────────────────────┐
│ Hagicode Desktop - ● Running│ (disabled, status display)
├─────────────────────────────┤
│ Show Window                 │ (always enabled)
├─────────────────────────────┤
│ Start Service               │ (visible only when stopped)
│ Stop Service                │ (visible only when running)
├─────────────────────────────┤
│ Open Hagicode               │ (visible only when running)
│ Open in Browser             │ (visible only when running)
├─────────────────────────────┤
│ Quit                        │ (always enabled)
└─────────────────────────────┘
```

#### 1.3 Dynamic Menu Building

```typescript
export function updateTrayMenu(): void {
  if (!tray) return;

  const isRunning = serverStatus === 'running';
  const config = statusConfig[serverStatus];
  const statusDisplay = `${config.indicator} ${config.text}`;

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: `Hagicode Desktop - ${statusDisplay}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    // Dynamic service control buttons
    ...(isRunning ? [] : [{
      label: 'Start Service',
      click: () => {
        // IPC call to start service
        mainWindow?.webContents.send('start-service');
      },
    }]),
    ...(isRunning ? [{
      label: 'Stop Service',
      click: () => {
        // IPC call to stop service
        mainWindow?.webContents.send('stop-service');
      },
    }] : []),
    { type: 'separator' },
    // Open buttons (only when running)
    ...(isRunning ? [{
      label: 'Open Hagicode',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    }, {
      label: 'Open in Browser',
      click: async () => {
        const url = await getServiceUrl();
        if (url) {
          shell.openExternal(url);
        }
      },
    }] : []),
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ];

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Hagicode Desktop - ${config.text}`);
}
```

### 2. Home Page Component Design

#### 2.1 Button Layout

**File**: `src/renderer/components/WebServiceStatusCard.tsx`

**Current Layout** (when running):
```
[Restart] [Stop] [Open in Browser]
```

**Enhanced Layout** (when running):
```
[Restart] [Stop] [Open Hagicode] [Open in Browser]
```

#### 2.2 Button Implementation

```typescript
{isRunning && (
  <>
    <Button onClick={handleRestart} disabled={isDisabled} variant="secondary">
      {/* Restart button content */}
    </Button>

    <Button onClick={handleStop} disabled={isDisabled} variant="destructive">
      {/* Stop button content */}
    </Button>

    {/* New: Open Hagicode Button */}
    <Button
      onClick={handleOpenInApp}
      variant="outline"
      disabled={isDisabled}
    >
      <Monitor className="w-4 h-4 mr-2" />
      {t('tray.openInApp')}
    </Button>

    {/* Updated: Open in Browser Button */}
    {webServiceInfo.url && (
      <Button
        onClick={handleOpenInBrowser}
        variant="outline"
        disabled={isDisabled}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        {t('tray.openInBrowser')}
      </Button>
    )}
  </>
)}
```

#### 2.3 Open in App Handler

```typescript
const handleOpenInApp = async () => {
  // The service URL will be loaded in the main window's webview
  // or we can navigate to a special route that embeds the service
  const serviceUrl = webServiceInfo.url;
  if (serviceUrl) {
    // Option 1: Navigate main window to service URL
    // (Need to ensure CORS/security settings allow this)
    // Option 2: Show window and let user access service
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
};
```

### 3. IPC Communication Design

#### 3.1 New IPC Handlers

**File**: `src/main/main.ts`

```typescript
// Get current service URL
ipcMain.handle('get-service-url', async () => {
  if (!webServiceManager) {
    return null;
  }
  const info = await webServiceManager.getStatus();
  return info.url;
});

// Start service (for tray menu)
ipcMain.on('start-service-from-tray', async () => {
  if (webServiceManager) {
    const result = await webServiceManager.start();
    if (result) {
      setServerStatus('running');
    }
  }
});

// Stop service (for tray menu)
ipcMain.on('stop-service-from-tray', async () => {
  if (webServiceManager) {
    const result = await webServiceManager.stop();
    if (result) {
      setServerStatus('stopped');
    }
  }
});
```

### 4. Internationalization Design

#### 4.1 Translation Key Structure

**Namespace**: `components.tray`

**Key Hierarchy**:
```
components
└── tray
    ├── status
    │   ├── running
    │   ├── stopped
    │   └── error
    ├── openInApp
    ├── openInBrowser
    ├── startService
    └── stopService
```

#### 4.2 Translation Files

**Chinese** (`zh-CN/components.json`):
```json
{
  "tray": {
    "status": {
      "running": "运行中",
      "stopped": "已停止",
      "error": "错误"
    },
    "openInApp": "打开 Hagicode",
    "openInBrowser": "浏览器打开",
    "startService": "启动服务",
    "stopService": "停止服务"
  }
}
```

**English** (`en-US/components.json`):
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

## Platform-Specific Considerations

### Windows
- Tray icon works natively
- Menu structure consistent
- Use `shell.openExternal()` for browser

### macOS
- Menu bar (top right) instead of tray
- Same menu structure
- Consider macOS conventions (don't use "Quit" on macOS, use standard app menu)

### Linux
- Uses libappindicator or Ayatana AppIndicator
- May require additional dependencies
- Test on multiple distributions (Ubuntu, Fedora, etc.)

## Security Considerations

1. **URL Validation**: Ensure service URL is valid before opening
2. **Shell Command Safety**: Only use `shell.openExternal()` with known URLs
3. **Window Management**: Ensure only one window instance is managed

## Performance Considerations

1. **Menu Updates**: Only rebuild menu when status actually changes
2. **Status Polling**: Use existing polling mechanism, don't add new polls
3. **IPC Calls**: Minimize IPC overhead by batching when possible

## Error Handling

### Service URL Unavailable
- Gracefully handle missing URL when "Open in Browser" is clicked
- Show notification: "Service URL not available"

### Window Not Found
- Handle case where mainWindow is null/undefined
- Show notification: "Window not available"

### Service Start/Stop Failures
- Update status to 'error' on failure
- Show notification with error message

## Testing Strategy

### Unit Tests
- Test status configuration mapping
- Test menu template generation
- Test translation key presence

### Integration Tests
- Test IPC handlers
- Test service manager integration
- Test tray status sync

### Manual Tests
- Platform-specific testing (Windows, macOS, Linux)
- Internationalization testing
- User flow testing

## Future Enhancements

1. **Native Tray Icons**: Use different colored icons for different states
2. **Notification Settings**: Allow users to configure which notifications to show
3. **Custom URL**: Allow users to specify custom service URL
4. **Keyboard Shortcuts**: Add global shortcuts for start/stop/open
