import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  onServerStatusChange: (callback: (status: 'running' | 'stopped' | 'error') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: 'running' | 'stopped' | 'error') => {
      callback(status);
    };
    ipcRenderer.on('server-status-changed', listener);
    return () => ipcRenderer.removeListener('server-status-changed', listener);
  },
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
