import { ipcMain } from 'electron';
import { HagicoServerClient, type ServerStatus } from '../../server.js';
import { setServerStatus } from '../../tray.js';

// Module state
let serverClient: HagicoServerClient | null = null;
let serverStatusSetter: ((status: string) => void) | null = null;

/**
 * Initialize server handlers with dependencies
 */
export function initServerHandlers(
  client: HagicoServerClient | null,
  setStatus: (status: string) => void
): void {
  serverClient = client;
  serverStatusSetter = setStatus;
}

/**
 * Register Hagico server control IPC handlers
 */
export function registerServerHandlers(
  client: HagicoServerClient | null,
  setServerStatusFn?: (status: string) => void
): void {
  serverClient = client;
  if (setServerStatusFn) {
    serverStatusSetter = setServerStatusFn;
  }

  // Get server status handler
  ipcMain.handle('get-server-status', async () => {
    if (!serverClient) {
      return 'stopped' as ServerStatus;
    }
    try {
      const info = await serverClient.getStatus();
      return info.status;
    } catch {
      return 'error' as ServerStatus;
    }
  });

  // Start server handler
  ipcMain.handle('start-server', async () => {
    if (!serverClient) {
      return false;
    }
    try {
      const result = await serverClient.startServer();
      if (result) {
        if (serverStatusSetter) {
          serverStatusSetter('running');
        } else {
          setServerStatus('running');
        }
      }
      return result;
    } catch {
      return false;
    }
  });

  // Stop server handler
  ipcMain.handle('stop-server', async () => {
    if (!serverClient) {
      return false;
    }
    try {
      const result = await serverClient.stopServer();
      if (result) {
        if (serverStatusSetter) {
          serverStatusSetter('stopped');
        } else {
          setServerStatus('stopped');
        }
      }
      return result;
    } catch {
      return false;
    }
  });

  console.log('[IPC] Server handlers registered');
}
