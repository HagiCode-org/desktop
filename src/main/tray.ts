import { Tray, Menu, nativeImage, app, Notification } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainWindow } from './main.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let serverStatus: 'running' | 'stopped' | 'error' = 'stopped';

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

  const statusText = serverStatus === 'running' ? 'Running' : serverStatus === 'stopped' ? 'Stopped' : 'Error';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Hagico Desktop - ${statusText}`,
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
    {
      label: 'Start Server',
      click: () => {
        // TODO: Implement server start
        console.log('Start server clicked');
      },
    },
    {
      label: 'Stop Server',
      click: () => {
        // TODO: Implement server stop
        console.log('Stop server clicked');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Hagico Desktop - ${statusText}`);
}

export function setServerStatus(status: 'running' | 'stopped' | 'error'): void {
  serverStatus = status;
  updateTrayMenu();
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
