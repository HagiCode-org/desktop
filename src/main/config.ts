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
}
