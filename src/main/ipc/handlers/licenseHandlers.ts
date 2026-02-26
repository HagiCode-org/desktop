import { ipcMain } from 'electron';
import { LicenseManager } from '../../license-manager.js';

// Module state
let licenseManager: LicenseManager | null = null;

/**
 * Initialize license handlers with dependencies
 */
export function initLicenseHandlers(manager: LicenseManager | null): void {
  licenseManager = manager;
}

/**
 * Register license management IPC handlers
 */
export function registerLicenseHandlers(manager: LicenseManager | null): void {
  licenseManager = manager;

  // License get handler
  ipcMain.handle('license:get', async () => {
    if (!licenseManager) {
      return null;
    }
    try {
      return licenseManager.getLicense();
    } catch (error) {
      console.error('Failed to get license:', error);
      return null;
    }
  });

  // License save handler
  ipcMain.handle('license:save', async (_, licenseKey: string) => {
    if (!licenseManager) {
      return {
        success: false,
        error: 'License manager not initialized'
      };
    }
    try {
      await licenseManager.saveLicense(licenseKey);
      return { success: true };
    } catch (error) {
      console.error('Failed to save license:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] License handlers registered');
}
