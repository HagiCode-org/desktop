import Store from 'electron-store';
import type { ServerConfig } from './server';

export interface AppSettings {
  language: string;
}

export interface RemoteModeConfig {
  enabled: boolean;
  url: string;
}

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  lastUpdated: string | null;
}

export interface AppConfig {
  server: ServerConfig;
  remoteMode: RemoteModeConfig;
  githubOAuth: GitHubOAuthConfig;
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
  remoteMode: {
    enabled: false,
    url: '',
  },
  githubOAuth: {
    clientId: '',
    clientSecret: '',
    lastUpdated: null,
  },
  startOnStartup: false,
  minimizeToTray: true,
  checkForUpdates: true,
  settings: {
    language: 'zh-CN',
  },
};

export const defaultRemoteModeConfig: RemoteModeConfig = {
  enabled: false,
  url: '',
};

export const defaultGitHubOAuthConfig: GitHubOAuthConfig = {
  clientId: '',
  clientSecret: '',
  lastUpdated: null,
};

export function normalizeGitHubOAuthConfig(
  config?: Partial<GitHubOAuthConfig> | null
): GitHubOAuthConfig {
  return {
    clientId: typeof config?.clientId === 'string' ? config.clientId.trim() : '',
    clientSecret: typeof config?.clientSecret === 'string' ? config.clientSecret.trim() : '',
    lastUpdated: typeof config?.lastUpdated === 'string' && config.lastUpdated.trim().length > 0
      ? config.lastUpdated
      : null,
  };
}

export function validateGitHubOAuthConfig(config: GitHubOAuthConfig): string | null {
  if (!config.clientId) {
    return 'GitHub Client ID is required.';
  }

  if (!config.clientSecret) {
    return 'GitHub Client Secret is required.';
  }

  return null;
}

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor(store?: Store<AppConfig>) {
    this.store = store ?? new Store<AppConfig>({
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

  getGitHubOAuthConfig(): GitHubOAuthConfig {
    return normalizeGitHubOAuthConfig(this.get('githubOAuth'));
  }

  setGitHubOAuthConfig(config: Partial<GitHubOAuthConfig>): GitHubOAuthConfig {
    const normalized = normalizeGitHubOAuthConfig({
      ...defaultGitHubOAuthConfig,
      ...config,
    });
    this.set('githubOAuth', normalized);
    return normalized;
  }

  clearGitHubOAuthConfig(): GitHubOAuthConfig {
    this.set('githubOAuth', { ...defaultGitHubOAuthConfig });
    return { ...defaultGitHubOAuthConfig };
  }

  /**
   * Get the underlying electron-store instance
   * This is needed for components that need direct access to the store
   */
  getStore(): Store<AppConfig> {
    return this.store;
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
