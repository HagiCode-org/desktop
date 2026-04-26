import Store from 'electron-store';
import type { ServerConfig } from './server';
import type { DataDirectorySource } from '../types/bootstrap.js';

export interface AppSettings {
  language: string;
}

export interface VersionAutoUpdateSettings {
  enabled: boolean;
  retainedArchiveCount: number;
}

export interface AppConfig {
  server: ServerConfig;
  omniroute?: {
    port?: number;
    password?: string;
  };
  versionAutoUpdate: VersionAutoUpdateSettings;
  startOnStartup: boolean;
  minimizeToTray: boolean;
  checkForUpdates: boolean;
  settings: AppSettings;
  dataDirectoryPath?: string;
  shutdownDirectory?: string;
  recordingDirectory?: string;
  logsDirectory?: string;
}

export interface ResolvedDataDirectorySelection {
  source: Extract<DataDirectorySource, 'default' | 'configured'>;
  requestedPath: string;
  configuredPath: string | null;
  defaultPath: string;
}

export const DEFAULT_VERSION_AUTO_UPDATE_SETTINGS: VersionAutoUpdateSettings = {
  enabled: true,
  retainedArchiveCount: 5,
};

export function normalizeRetainedArchiveCount(value: unknown, fallback: number = DEFAULT_VERSION_AUTO_UPDATE_SETTINGS.retainedArchiveCount): number {
  const parsed = typeof value === 'string'
    ? Number.parseInt(value, 10)
    : typeof value === 'number'
      ? value
      : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeVersionAutoUpdateSettings(
  settings?: Partial<VersionAutoUpdateSettings> | null,
): VersionAutoUpdateSettings {
  return {
    enabled: settings?.enabled ?? DEFAULT_VERSION_AUTO_UPDATE_SETTINGS.enabled,
    retainedArchiveCount: normalizeRetainedArchiveCount(settings?.retainedArchiveCount),
  };
}

const defaultConfig: AppConfig = {
  server: {
    host: 'localhost',
    port: 36546,
  },
  versionAutoUpdate: DEFAULT_VERSION_AUTO_UPDATE_SETTINGS,
  startOnStartup: false,
  minimizeToTray: true,
  checkForUpdates: true,
  settings: {
    language: 'zh-CN',
  },
};

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor(store?: Store<AppConfig>) {
    this.store = store ?? new Store<AppConfig>({
      defaults: defaultConfig,
      name: 'hagicode-desktop-config',
    });

    this.removeLegacyTelemetryPreference();
    this.removeRetiredRemoteModeConfig();
  }

  private removeLegacyTelemetryPreference(): void {
    const legacyStore = this.store as unknown as {
      get: (key: string) => unknown;
      delete: (key: string) => void;
    };

    if (legacyStore.get('telemetry') !== undefined) {
      legacyStore.delete('telemetry');
    }
  }

  private removeRetiredRemoteModeConfig(): void {
    const legacyStore = this.store as unknown as {
      get: (key: string) => unknown;
      delete: (key: string) => void;
    };

    if (legacyStore.get('remoteMode') !== undefined) {
      legacyStore.delete('remoteMode');
    }
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
   * Get data directory path
   */
  getDataDirectoryPath(): string | undefined {
    return this.get('dataDirectoryPath');
  }

  resolveDataDirectorySelection(defaultPath: string): ResolvedDataDirectorySelection {
    const configuredPath = this.getDataDirectoryPath()?.trim() ?? '';

    if (configuredPath.length > 0) {
      return {
        source: 'configured',
        requestedPath: configuredPath,
        configuredPath,
        defaultPath,
      };
    }

    return {
      source: 'default',
      requestedPath: defaultPath,
      configuredPath: null,
      defaultPath,
    };
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

  getVersionAutoUpdateSettings(): VersionAutoUpdateSettings {
    const current = this.store.get('versionAutoUpdate');
    const normalized = normalizeVersionAutoUpdateSettings(current);

    if (
      current?.enabled !== normalized.enabled
      || current?.retainedArchiveCount !== normalized.retainedArchiveCount
    ) {
      this.store.set('versionAutoUpdate', normalized);
    }

    return normalized;
  }

  setVersionAutoUpdateSettings(
    nextSettings: Partial<VersionAutoUpdateSettings>,
  ): VersionAutoUpdateSettings {
    if (
      nextSettings.retainedArchiveCount !== undefined
      && normalizeRetainedArchiveCount(nextSettings.retainedArchiveCount) !== nextSettings.retainedArchiveCount
    ) {
      throw new Error('retainedArchiveCount must be a positive integer');
    }

    const merged = normalizeVersionAutoUpdateSettings({
      ...this.getVersionAutoUpdateSettings(),
      ...nextSettings,
    });
    this.store.set('versionAutoUpdate', merged);
    return merged;
  }
}
