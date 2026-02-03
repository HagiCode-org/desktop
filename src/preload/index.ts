import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  onServerStatusChange: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    ipcRenderer.on('server-status-changed', listener);
    return () => ipcRenderer.removeListener('server-status-changed', listener);
  },
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),

  // Web Service Management APIs
  getWebServiceStatus: () => ipcRenderer.invoke('get-web-service-status'),
  startWebService: () => ipcRenderer.invoke('start-web-service'),
  stopWebService: () => ipcRenderer.invoke('stop-web-service'),
  restartWebService: () => ipcRenderer.invoke('restart-web-service'),
  getWebServiceVersion: () => ipcRenderer.invoke('get-web-service-version'),
  getWebServiceUrl: () => ipcRenderer.invoke('get-web-service-url'),
  onWebServiceStatusChange: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    ipcRenderer.on('web-service-status-changed', listener);
    return () => ipcRenderer.removeListener('web-service-status-changed', listener);
  },

  // Package Management APIs
  checkPackageInstallation: () => ipcRenderer.invoke('check-package-installation'),
  installWebServicePackage: (version) => ipcRenderer.invoke('install-web-service-package', version),
  getPackageVersion: () => ipcRenderer.invoke('get-package-version'),
  getAvailableVersions: () => ipcRenderer.invoke('get-available-versions'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  onPackageInstallProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress);
    };
    ipcRenderer.on('package-install-progress', listener);
    return () => ipcRenderer.removeListener('package-install-progress', listener);
  },

  // Dependency Management APIs
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
  installDependency: (dependencyType) => ipcRenderer.invoke('install-dependency', dependencyType),
  onDependencyStatusChange: (callback) => {
    const listener = (_event, dependencies) => {
      callback(dependencies);
    };
    ipcRenderer.on('dependency-status-changed', listener);
    return () => ipcRenderer.removeListener('dependency-status-changed', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
