import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHagicodeInAppWindow } from '../../hagicode-url.js';
import { registerClipboardHandlers, wireDesktopWindowClipboard } from '../../clipboard-integration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path helper for production builds with asar packaging.
 */
function getDistRootPath(): string {
  return path.resolve(__dirname, '../..');
}

/**
 * Get the application root path
 */
function getAppRootPath(): string {
  return path.resolve(__dirname, '../..', '..');
}

// Module state
let mainWindow: BrowserWindow | null = null;

/**
 * Initialize window handlers with the main window reference
 */
export function initWindowHandlers(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * Get the main window reference
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Register window management IPC handlers
 */
export function registerWindowHandlers(window: BrowserWindow | null): void {
  mainWindow = window;
  registerClipboardHandlers();

  // Get version handler
  ipcMain.handle('app-version', () => {
    return app.getVersion();
  });

  // Show window handler
  ipcMain.handle('show-window', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Hide window handler
  ipcMain.handle('hide-window', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  // Open Hagicode in app handler
  ipcMain.handle('open-hagicode-in-app', async (_, url: string) => {
    return await openHagicodeInAppWindow({
      url,
      logScope: 'WindowHandlers',
      createWindow: () => {
        const distRoot = getDistRootPath();
        const appRoot = getAppRootPath();
        const preloadPath = path.join(distRoot, 'preload', 'index.mjs');
        const iconPath = path.join(appRoot, 'resources', 'icon.png');

        const childWindow = new BrowserWindow({
          minWidth: 800,
          minHeight: 600,
          show: false,
          autoHideMenuBar: true,
          icon: iconPath,
          webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            devTools: !app.isPackaged,
          },
        });

        wireDesktopWindowClipboard(childWindow);
        return childWindow;
      },
    });
  });

  console.log('[IPC] Window handlers registered');
}
