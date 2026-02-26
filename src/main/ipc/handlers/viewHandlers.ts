import { ipcMain, BrowserWindow } from 'electron';
import { PCodeWebServiceManager } from '../../web-service-manager.js';
import { MenuManager } from '../../menu-manager.js';

// Module state
interface ViewHandlerState {
  webServiceManager: PCodeWebServiceManager | null;
  menuManager: MenuManager | null;
}

const state: ViewHandlerState = {
  webServiceManager: null,
  menuManager: null,
};

/**
 * Initialize view handlers with dependencies
 */
export function initViewHandlers(
  webServiceManager: PCodeWebServiceManager | null,
  menuManager: MenuManager | null
): void {
  state.webServiceManager = webServiceManager;
  state.menuManager = menuManager;
}

/**
 * Register view switching and language IPC handlers
 */
export function registerViewHandlers(deps: {
  webServiceManager: PCodeWebServiceManager | null;
  menuManager: MenuManager | null;
}): void {
  state.webServiceManager = deps.webServiceManager;
  state.menuManager = deps.menuManager;

  // Switch view handler
  ipcMain.handle('switch-view', async (_, view: 'system' | 'web' | 'dependency' | 'version' | 'license') => {
    console.log('[ViewHandlers] Switch view requested:', view);

    if (view === 'web') {
      if (!state.webServiceManager) {
        return {
          success: false,
          reason: 'web-service-not-initialized',
        };
      }

      try {
        const status = await state.webServiceManager.getStatus();
        if (status.status !== 'running') {
          return {
            success: false,
            reason: 'web-service-not-running',
            canStart: true,
          };
        }

        return {
          success: true,
          url: status.url,
        };
      } catch (error) {
        return {
          success: false,
          reason: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { success: true };
  });

  // Get current view handler
  ipcMain.handle('get-current-view', async () => {
    // This would need to be tracked by the renderer or stored
    return 'system';
  });

  // Language changed handler
  ipcMain.handle('language-changed', async (_, language: string) => {
    try {
      if (state.menuManager) {
        state.menuManager.updateMenuLanguage(language);
      }
      return { success: true };
    } catch (error) {
      console.error('[ViewHandlers] Failed to handle language change:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] View handlers registered');
}
