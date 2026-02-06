import { Tray, Menu, nativeImage, app, Notification, shell, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainWindow } from './main.js';

// Reference to webServiceManager - will be set from main.ts
let webServiceManagerRef: any = null;

export function setWebServiceManagerRef(ref: any): void {
  webServiceManagerRef = ref;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let serverStatus: 'running' | 'stopped' | 'error' = 'stopped';
let currentServiceUrl: string | null = null;

// Translation helper - supports multiple languages
const getTrayLabel = (key: string): string => {
  const labels: Record<string, Record<string, string>> = {
    'showWindow': {
      'en': 'Show Window',
      'zh': '显示窗口',
      'zh-CN': '显示窗口',
      'zh-TW': '顯示視窗'
    },
    'startService': {
      'en': 'Start Service',
      'zh': '启动服务',
      'zh-CN': '启动服务',
      'zh-TW': '啟動服務'
    },
    'stopService': {
      'en': 'Stop Service',
      'zh': '停止服务',
      'zh-CN': '停止服务',
      'zh-TW': '停止服務'
    },
    'openHagicode': {
      'en': 'Open Hagicode',
      'zh': '打开 Hagicode',
      'zh-CN': '打开 Hagicode',
      'zh-TW': '打開 Hagicode'
    },
    'openInBrowser': {
      'en': 'Open in Browser',
      'zh': '浏览器打开',
      'zh-CN': '浏览器打开',
      'zh-TW': '瀏覽器打開'
    },
    'quit': {
      'en': 'Quit',
      'zh': '退出',
      'zh-CN': '退出',
      'zh-TW': '退出'
    }
  };

  // Get app locale
  const locale = app.getLocale?.() || 'en';
  const lang = locale.startsWith('zh') ? locale : 'en';

  return labels[key]?.[lang] || labels[key]?.['en'] || key;
};

export function createTray(): void {
  // Load tray icon
  const iconPath = path.join(__dirname, '../../resources/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

export function updateTrayMenu(): void {
  if (!tray) return;

  const isRunning = serverStatus === 'running';

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Hagicode Desktop',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: getTrayLabel('showWindow'),
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
      label: getTrayLabel('startService'),
      click: async () => {
        // Update status to starting immediately
        setServerStatus('starting');
        try {
          if (webServiceManagerRef) {
            const result = await webServiceManagerRef.start();
            const status = await webServiceManagerRef.getStatus();
            setServerStatus(status.status, status.url);
            setServiceUrl(status.url);
            // Notify renderer of status change
            mainWindow?.webContents.send('web-service-status-changed', status);
          } else {
            // Fallback: send IPC message to renderer
            mainWindow?.webContents.send('tray-start-service');
          }
        } catch (error) {
          console.error('Failed to start service from tray:', error);
          setServerStatus('error');
        }
      },
    }]),
    ...(isRunning ? [{
      label: getTrayLabel('stopService'),
      click: async () => {
        // Update status to stopping immediately
        setServerStatus('stopping');
        try {
          if (webServiceManagerRef) {
            const result = await webServiceManagerRef.stop();
            const status = await webServiceManagerRef.getStatus();
            setServerStatus(status.status);
            setServiceUrl(null);
            // Notify renderer of status change
            mainWindow?.webContents.send('web-service-status-changed', status);
          } else {
            // Fallback: send IPC message to renderer
            mainWindow?.webContents.send('tray-stop-service');
          }
        } catch (error) {
          console.error('Failed to stop service from tray:', error);
          setServerStatus('error');
        }
      },
    }] : []),
    { type: 'separator' },
    // Open buttons (only when running)
    ...(isRunning ? [{
      label: getTrayLabel('openHagicode'),
      click: async () => {
        if (currentServiceUrl) {
          shell.openExternal(currentServiceUrl);
        } else {
          showNotification('Error', 'Service URL not available');
        }
      },
    }, {
      label: getTrayLabel('openInBrowser'),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    }] : []),
    { type: 'separator' },
    {
      label: getTrayLabel('quit'),
      click: () => {
        app.quit();
      },
    },
  ];

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Hagicode Desktop');
}

export function setServerStatus(status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping', url?: string | null): void {
  // Map starting/stopping to appropriate display status
  const displayStatus: 'running' | 'stopped' | 'error' =
    status === 'running' ? 'running' :
    status === 'stopped' ? 'stopped' :
    status === 'error' ? 'error' :
    status === 'starting' ? 'running' :  // Show as running during startup
    'stopped';  // Show as stopped during shutdown

  serverStatus = displayStatus;
  if (url !== undefined) {
    currentServiceUrl = url;
  }
  updateTrayMenu();
}

export function setServiceUrl(url: string | null | undefined): void {
  currentServiceUrl = url || null;
  // Rebuild menu when URL changes
  if (serverStatus === 'running') {
    updateTrayMenu();
  }
}

export function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
    }).show();
  }
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
