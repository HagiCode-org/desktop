import Store from 'electron-store';
import type { ServerConfig } from './server.js';

export interface AppConfig {
  server: ServerConfig;
  startOnStartup: boolean;
  minimizeToTray: boolean;
  checkForUpdates: boolean;
}

const defaultConfig: AppConfig = {
  server: {
    host: 'localhost',
    port: 3000,
  },
  startOnStartup: false,
  minimizeToTray: true,
  checkForUpdates: true,
};

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      defaults: defaultConfig,
      name: 'hagico-desktop-config',
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
}
