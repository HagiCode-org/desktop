import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { PCodeWebServiceManager, StartupPhase, type ProcessInfo, type WebServiceConfig } from '../../web-service-manager.js';
import { VersionManager } from '../../version-manager.js';
import { ConfigManager } from '../../config.js';
import { manifestReader } from '../../manifest-reader.js';
import { buildStartupFailurePayload, type StartupFailurePayload } from '../../startup-failure-payload.js';
import { setServerStatus, setServiceUrl } from '../../tray.js';
import { DEFAULT_WEB_SERVICE_HOST, DEFAULT_WEB_SERVICE_PORT } from '../../../types/web-service-network.js';

interface StartServiceError {
  type: string;
  details: string;
}

export interface StartWebServiceResponse {
  success: boolean;
  error?: StartServiceError;
  startupFailure?: StartupFailurePayload;
}

export interface WebServiceConfigUpdateResponse {
  success: boolean;
  error: string | null;
  errorCode?: 'invalid-listen-host' | 'invalid-port' | 'unknown';
}

// Module state
interface WebServiceHandlerState {
  webServiceManager: PCodeWebServiceManager | null;
  versionManager: VersionManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
  setServerStatusFn?: (status: string, url?: string | null) => void;
  setServiceUrlFn?: (url: string | null) => void;
}

const state: WebServiceHandlerState = {
  webServiceManager: null,
  versionManager: null,
  mainWindow: null,
  configManager: null,
};

/**
 * Initialize web service handlers with dependencies
 */
export function initWebServiceHandlers(
  webServiceManager: PCodeWebServiceManager | null,
  versionManager: VersionManager | null,
  mainWindow: BrowserWindow | null,
  configManager: ConfigManager | null,
  setServerStatusFn?: (status: string, url?: string | null) => void,
  setServiceUrlFn?: (url: string | null) => void
): void {
  state.webServiceManager = webServiceManager;
  state.versionManager = versionManager;
  state.mainWindow = mainWindow;
  state.configManager = configManager;
  state.setServerStatusFn = setServerStatusFn;
  state.setServiceUrlFn = setServiceUrlFn;
}

/**
 * Register web service control IPC handlers
 */
export function registerWebServiceHandlers(deps: {
  webServiceManager: PCodeWebServiceManager | null;
  versionManager: VersionManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
  setServerStatus?: (status: string, url?: string | null) => void;
  setServiceUrl?: (url: string | null) => void;
}): void {
  state.webServiceManager = deps.webServiceManager;
  state.versionManager = deps.versionManager;
  state.mainWindow = deps.mainWindow;
  state.configManager = deps.configManager;
  state.setServerStatusFn = deps.setServerStatus;
  state.setServiceUrlFn = deps.setServiceUrl;

  // Get web service status handler
  ipcMain.handle('get-web-service-status', async () => {
    if (!state.webServiceManager) {
      return {
        status: 'stopped',
        pid: null,
        uptime: 0,
        startTime: null,
        url: null,
        restartCount: 0,
        phase: StartupPhase.Idle,
        host: DEFAULT_WEB_SERVICE_HOST,
        port: DEFAULT_WEB_SERVICE_PORT,
      } as ProcessInfo;
    }
    try {
      return await state.webServiceManager.getStatus();
    } catch (error) {
      console.error('Failed to get web service status:', error);
      return {
        status: 'error',
        pid: null,
        uptime: 0,
        startTime: null,
        url: null,
        restartCount: 0,
        phase: StartupPhase.Error,
        host: DEFAULT_WEB_SERVICE_HOST,
        port: DEFAULT_WEB_SERVICE_PORT,
      } as ProcessInfo;
    }
  });

  // Start web service handler
  ipcMain.handle('start-web-service', async (_, force?: boolean) => {
    if (!state.webServiceManager) {
      return {
        success: false,
        error: { type: 'manager-not-initialized', details: 'Web service manager not initialized' }
      } as StartWebServiceResponse;
    }

    if (!state.versionManager) {
      return {
        success: false,
        error: { type: 'version-manager-not-initialized', details: 'Version manager not initialized' }
      } as StartWebServiceResponse;
    }

    try {
      const activeVersion = await state.versionManager.getActiveVersion();

      if (!activeVersion) {
        log.warn('[WebServiceHandlers] No active version found, cannot start web service');
        return {
          success: false,
          error: { type: 'no-active-version', details: 'No active version found. Please install and activate a version first.' }
        } as StartWebServiceResponse;
      }

      state.webServiceManager.setActiveVersion(activeVersion.id);

      const manifest = await manifestReader.readManifest(activeVersion.installedPath);
      if (manifest) {
        const entryPoint = manifestReader.parseEntryPoint(manifest);
        state.webServiceManager.setEntryPoint(entryPoint);
      } else {
        log.warn('[WebServiceHandlers] No manifest found, entryPoint may not be available');
        state.webServiceManager.setEntryPoint(null);
      }

      log.info('[WebServiceHandlers] Starting web service with version:', activeVersion.id, 'at path:', activeVersion.installedPath);

      const result = await state.webServiceManager.start();

      const status = await state.webServiceManager.getStatus();
      state.mainWindow?.webContents.send('web-service-status-changed', status);

      if (state.setServerStatusFn) {
        state.setServerStatusFn(status.status, status.url);
      } else {
        setServerStatus(status.status, status.url);
      }
      if (state.setServiceUrlFn) {
        state.setServiceUrlFn(status.url);
      } else {
        setServiceUrl(status.url);
      }

      if (!result.success) {
        const startupFailure = buildStartupFailurePayload(result, status.port);
        return {
          success: false,
          error: { type: 'startup-failed', details: startupFailure.summary },
          startupFailure,
        } as StartWebServiceResponse;
      }

      return { success: true } as StartWebServiceResponse;
    } catch (error) {
      log.error('Failed to start web service:', error);
      return {
        success: false,
        error: {
          type: 'unknown',
          details: error instanceof Error ? error.message : String(error)
        }
      } as StartWebServiceResponse;
    }
  });

  // Stop web service handler
  ipcMain.handle('stop-web-service', async () => {
    if (!state.webServiceManager) {
      return false;
    }
    try {
      const result = await state.webServiceManager.stop();
      const status = await state.webServiceManager.getStatus();
      state.mainWindow?.webContents.send('web-service-status-changed', status);

      if (state.setServerStatusFn) {
        state.setServerStatusFn(status.status);
      } else {
        setServerStatus(status.status);
      }
      if (state.setServiceUrlFn) {
        state.setServiceUrlFn(null);
      } else {
        setServiceUrl(null);
      }

      return result;
    } catch (error) {
      console.error('Failed to stop web service:', error);
      return false;
    }
  });

  // Restart web service handler
  ipcMain.handle('restart-web-service', async () => {
    if (!state.webServiceManager) {
      return false;
    }
    try {
      const result = await state.webServiceManager.restart();
      const status = await state.webServiceManager.getStatus();
      state.mainWindow?.webContents.send('web-service-status-changed', status);

      if (state.setServerStatusFn) {
        state.setServerStatusFn(status.status, status.url);
      } else {
        setServerStatus(status.status, status.url);
      }
      if (state.setServiceUrlFn) {
        state.setServiceUrlFn(status.url);
      } else {
        setServiceUrl(status.url);
      }

      return result;
    } catch (error) {
      console.error('Failed to restart web service:', error);
      return false;
    }
  });

  // Get web service version handler
  ipcMain.handle('get-web-service-version', async () => {
    if (!state.webServiceManager) {
      return 'unknown';
    }
    try {
      return await state.webServiceManager.getVersion();
    } catch (error) {
      console.error('Failed to get web service version:', error);
      return 'unknown';
    }
  });

  // Get web service URL handler
  ipcMain.handle('get-web-service-url', async () => {
    if (!state.webServiceManager) {
      return null;
    }
    try {
      const status = await state.webServiceManager.getStatus();
      return status.url;
    } catch (error) {
      console.error('Failed to get web service URL:', error);
      return null;
    }
  });

  // Check web service port handler
  ipcMain.handle('check-web-service-port', async () => {
    if (!state.webServiceManager) {
      return {
        port: 5000,
        available: false,
        error: 'Web service manager not initialized'
      };
    }
    try {
      const status = await state.webServiceManager.getStatus();
      const available = await state.webServiceManager.checkPortAvailable(status.port);
      return {
        host: status.host,
        port: status.port,
        available,
        error: null
      };
    } catch (error) {
      console.error('Failed to check port:', error);
      return {
        host: DEFAULT_WEB_SERVICE_HOST,
        port: 5000,
        available: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Set web service config handler
  ipcMain.handle('set-web-service-config', async (_, config: Partial<WebServiceConfig>) => {
    if (!state.webServiceManager) {
      return { success: false, error: 'Web service manager not initialized', errorCode: 'unknown' } satisfies WebServiceConfigUpdateResponse;
    }
    try {
      await state.webServiceManager.updateConfig(config);
      const status = await state.webServiceManager.getStatus();
      state.mainWindow?.webContents.send('web-service-status-changed', status);
      return { success: true, error: null } satisfies WebServiceConfigUpdateResponse;
    } catch (error) {
      console.error('Failed to update web service config:', error);
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = message.includes('listen host')
        ? 'invalid-listen-host'
        : message.includes('Port must be between')
          ? 'invalid-port'
          : 'unknown';
      return {
        success: false,
        error: message,
        errorCode,
      } satisfies WebServiceConfigUpdateResponse;
    }
  });

  console.log('[IPC] Web service handlers registered');
}
