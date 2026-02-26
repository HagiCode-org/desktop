import { ipcMain, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';
import { OnboardingManager } from '../../onboarding-manager.js';

// Module state
interface OnboardingHandlerState {
  onboardingManager: OnboardingManager | null;
  mainWindow: BrowserWindow | null;
}

const state: OnboardingHandlerState = {
  onboardingManager: null,
  mainWindow: null,
};

/**
 * Initialize onboarding handlers with dependencies
 */
export function initOnboardingHandlers(
  onboardingManager: OnboardingManager | null,
  mainWindow: BrowserWindow | null
): void {
  state.onboardingManager = onboardingManager;
  state.mainWindow = mainWindow;
}

/**
 * Register onboarding IPC handlers
 */
export function registerOnboardingHandlers(deps: {
  onboardingManager: OnboardingManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.onboardingManager = deps.onboardingManager;
  state.mainWindow = deps.mainWindow;

  // Onboarding check trigger handler
  ipcMain.handle('onboarding:check-trigger', async () => {
    if (!state.onboardingManager) {
      return { shouldShow: false, reason: 'not-initialized' };
    }
    try {
      return await state.onboardingManager.checkTriggerCondition();
    } catch (error) {
      console.error('Failed to check onboarding trigger:', error);
      return { shouldShow: false, reason: 'error' };
    }
  });

  // Onboarding get state handler
  ipcMain.handle('onboarding:get-state', async () => {
    if (!state.onboardingManager) {
      return null;
    }
    try {
      return state.onboardingManager.getStoredState();
    } catch (error) {
      console.error('Failed to get onboarding state:', error);
      return null;
    }
  });

  // Onboarding skip handler
  ipcMain.handle('onboarding:skip', async () => {
    if (!state.onboardingManager) {
      return { success: false, error: 'Onboarding manager not initialized' };
    }
    try {
      await state.onboardingManager.skipOnboarding();
      return { success: true };
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Onboarding download package handler
  ipcMain.handle('onboarding:download-package', async () => {
    if (!state.onboardingManager) {
      return { success: false, error: 'Onboarding manager not initialized' };
    }
    try {
      const result = await state.onboardingManager.downloadLatestPackage((progress) => {
        state.mainWindow?.webContents.send('onboarding:download-progress', progress);
      });
      return result;
    } catch (error) {
      console.error('Failed to download package:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Onboarding install dependencies handler
  ipcMain.handle('onboarding:install-dependencies', async (_, versionId: string) => {
    if (!state.onboardingManager) {
      return { success: false, error: 'Onboarding manager not initialized' };
    }
    try {
      const result = await state.onboardingManager.installDependencies(versionId, (status) => {
        state.mainWindow?.webContents.send('onboarding:dependency-progress', status);
      });
      return result;
    } catch (error) {
      console.error('Failed to install dependencies:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Onboarding check dependencies handler
  ipcMain.handle('onboarding:check-dependencies', async (_, versionId: string) => {
    if (!state.onboardingManager) {
      return { success: false, error: 'Onboarding manager not initialized' };
    }
    try {
      const result = await state.onboardingManager.checkDependenciesStatus(versionId, (status) => {
        state.mainWindow?.webContents.send('onboarding:dependency-progress', status);
      });
      return result;
    } catch (error) {
      console.error('Failed to check dependencies:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Onboarding start service handler
  ipcMain.handle('onboarding:start-service', async (_, versionId: string) => {
    if (!state.onboardingManager) {
      return { success: false, error: 'Onboarding manager not initialized' };
    }
    try {
      const result = await state.onboardingManager.startWebService(versionId, (progress) => {
        state.mainWindow?.webContents.send('onboarding:service-progress', progress);
      });
      return result;
    } catch (error) {
      console.error('Failed to start service:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Onboarding complete handler
  ipcMain.handle('onboarding:complete', async (_, versionId: string) => {
    if (!state.onboardingManager) {
      return { success: false, error: 'Onboarding manager not initialized' };
    }
    try {
      await state.onboardingManager.completeOnboarding(versionId);
      return { success: true };
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Onboarding reset handler
  ipcMain.handle('onboarding:reset', async () => {
    if (!state.onboardingManager) {
      return { success: false, error: 'Onboarding manager not initialized' };
    }
    try {
      await state.onboardingManager.resetOnboarding();
      state.mainWindow?.webContents.send('onboarding:show');
      return { success: true };
    } catch (error) {
      console.error('Failed to reset onboarding:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] Onboarding handlers registered');
}
