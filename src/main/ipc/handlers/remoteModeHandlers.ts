import { ipcMain } from 'electron';
import { ConfigManager } from '../../config.js';

// Module state
interface RemoteModeHandlerState {
  configManager: ConfigManager | null;
}

const state: RemoteModeHandlerState = {
  configManager: null,
};

/**
 * Initialize remote mode handlers with dependencies
 */
export function initRemoteModeHandlers(
  configManager: ConfigManager | null
): void {
  state.configManager = configManager;
}

/**
 * Register remote mode IPC handlers
 */
export function registerRemoteModeHandlers(deps: {
  configManager: ConfigManager | null;
}): void {
  state.configManager = deps.configManager;

  // Set remote mode configuration handler
  ipcMain.handle('remote-mode:set', async (_, enabled: boolean, url: string) => {
    try {
      if (!state.configManager) {
        throw new Error('ConfigManager not initialized');
      }

      // Validate URL if enabled
      if (enabled && url) {
        const validationResult = validateUrl(url);
        if (!validationResult.isValid) {
          return {
            success: false,
            error: validationResult.error
          };
        }
      }

      // Save configuration
      const currentConfig = state.configManager.getAll();
      const updatedConfig = {
        ...currentConfig,
        remoteMode: {
          enabled,
          url: enabled ? url : ''
        }
      };

      state.configManager.getStore().set('remoteMode', {
        enabled,
        url: enabled ? url : ''
      });

      return { success: true };
    } catch (error) {
      console.error('[RemoteModeHandlers] Failed to set remote mode:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Get remote mode configuration handler
  ipcMain.handle('remote-mode:get', async () => {
    try {
      if (!state.configManager) {
        throw new Error('ConfigManager not initialized');
      }

      const config = state.configManager.getAll();
      const remoteMode = config.remoteMode || { enabled: false, url: '' };

      return remoteMode;
    } catch (error) {
      console.error('[RemoteModeHandlers] Failed to get remote mode:', error);
      throw error;
    }
  });

  // Validate remote URL handler
  ipcMain.handle('remote-mode:validate-url', async (_, url: string) => {
    try {
      const result = validateUrl(url);
      return result;
    } catch (error) {
      console.error('[RemoteModeHandlers] Failed to validate URL:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] Remote mode handlers registered');
}

/**
 * Validate URL format
 */
function validateUrl(url: string): { isValid: boolean; error?: string } {
  if (!url || url.trim() === '') {
    return { isValid: false, error: 'URL cannot be empty' };
  }

  try {
    const parsedUrl = new URL(url);
    // Only allow http and https protocols
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { isValid: false, error: 'Only HTTP and HTTPS URLs are supported' };
    }
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid URL format. Please enter a valid URL (e.g., https://hagicode.example.com)'
    };
  }
}