import Store from 'electron-store';
import type { ServerConfig } from './server';

export interface AppSettings {
  language: string;
}

export interface LicenseConfig {
  licenseKey: string;
  isConfigured: boolean;
  updatedAt: string;
}

export interface AppConfig {
  server: ServerConfig;
  license: LicenseConfig;
  startOnStartup: boolean;
  minimizeToTray: boolean;
  checkForUpdates: boolean;
  settings: AppSettings;
  dataDirectoryPath?: string;
  shutdownDirectory?: string;
  recordingDirectory?: string;
  logsDirectory?: string;
}

const defaultConfig: AppConfig = {
  server: {
    host: 'localhost',
    port: 36546,
  },
  license: {
    licenseKey: '',
    isConfigured: false,
    updatedAt: '',
  },
  startOnStartup: false,
  minimizeToTray: true,
  checkForUpdates: true,
  settings: {
    language: 'zh-CN',
  },
};

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      defaults: defaultConfig,
      name: 'hagicode-desktop-config',
    });
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key);
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.store.set(key, value);
  }

  getAll(): AppConfig {
    return this.store.store;
  }

  reset(): void {
    this.store.clear();
  }

  getServerConfig(): ServerConfig {
    return this.get('server');
  }

  setServerConfig(config: Partial<ServerConfig>): void {
    const current = this.getServerConfig();
    this.set('server', { ...current, ...config });
  }

  /**
   * Get the underlying electron-store instance
   * This is needed for components that need direct access to the store
   */
  getStore(): Store<AppConfig> {
    return this.store;
  }

  /**
   * Get license configuration
   */
  getLicense(): LicenseConfig {
    return this.get('license');
  }

  /**
   * Set license configuration
   */
  setLicense(licenseKey: string): void {
    const current = this.getLicense();
    this.set('license', {
      licenseKey,
      isConfigured: !!licenseKey,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get data directory path
   */
  getDataDirectoryPath(): string | undefined {
    return this.get('dataDirectoryPath');
  }

  /**
   * Set data directory path
   */
  setDataDirectoryPath(path: string): void {
    this.set('dataDirectoryPath', path);
  }

  /**
   * Clear data directory path (reset to default)
   */
  clearDataDirectoryPath(): void {
    this.store.delete('dataDirectoryPath');
  }

  /**
   * Get shutdown directory
   */
  getShutdownDirectory(): string | undefined {
    return this.store.get('shutdownDirectory') as string | undefined;
  }

  /**
   * Set shutdown directory
   */
  setShutdownDirectory(path: string): void {
    this.set('shutdownDirectory', path);
  }

  /**
   * Get recording directory
   */
  getRecordingDirectory(): string | undefined {
    return this.store.get('recordingDirectory') as string | undefined;
  }

  /**
   * Set recording directory
   */
  setRecordingDirectory(path: string): void {
    this.set('recordingDirectory', path);
  }

  /**
   * Get logs directory
   */
  getLogsDirectory(): string | undefined {
    return this.store.get('logsDirectory') as string | undefined;
  }

  /**
   * Set logs directory
   */
  setLogsDirectory(path: string): void {
    this.set('logsDirectory', path);
  }

  /**
   * Get current language
   */
  getCurrentLanguage(): string | undefined {
    return this.store.get('language') as string | undefined;
  }

  /**
   * Set current language
   */
  setCurrentLanguage(language: string): void {
    this.store.set('language', language);
  }
}
