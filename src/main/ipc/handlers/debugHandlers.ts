import { ipcMain, BrowserWindow } from 'electron';
import { ConfigManager } from '../../config.js';

// Module state
interface DebugHandlerState {
  configManager: ConfigManager | null;
  mainWindow: BrowserWindow | null;
}

const state: DebugHandlerState = {
  configManager: null,
  mainWindow: null,
};

/**
 * Initialize debug handlers with dependencies
 */
export function initDebugHandlers(
  configManager: ConfigManager | null,
  mainWindow: BrowserWindow | null
): void {
  state.configManager = configManager;
  state.mainWindow = mainWindow;
}

/**
 * Register debug mode IPC handlers
 */
export function registerDebugHandlers(deps: {
  configManager: ConfigManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.configManager = deps.configManager;
  state.mainWindow = deps.mainWindow;

  // Set debug mode handler
  ipcMain.handle('set-debug-mode', async (_, mode: { ignoreDependencyCheck: boolean }) => {
    try {
      const storeKey = 'debugMode';
      state.configManager?.getStore().set(storeKey, mode);
      state.mainWindow?.webContents.send('debug-mode-changed', mode);
      return { success: true };
    } catch (error) {
      console.error('Failed to set debug mode:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get debug mode handler
  ipcMain.handle('get-debug-mode', async () => {
    try {
      const storeKey = 'debugMode';
      const mode = state.configManager?.getStore().get(storeKey, { ignoreDependencyCheck: false }) as { ignoreDependencyCheck: boolean };
      return mode;
    } catch (error) {
      console.error('Failed to get debug mode:', error);
      return { ignoreDependencyCheck: false };
    }
  });

  console.log('[IPC] Debug handlers registered');
}
