import crypto from 'node:crypto';
import Store from 'electron-store';
import type { ServerConfig } from './server';
import { resolveDesktopLanguageCode } from '../shared/desktop-languages.js';
import {
  CODE_SERVER_DEFAULT_PORT,
  type CodeServerConfigSnapshot,
} from '../types/code-server-management.js';

export interface AppSettings {
  language: string;
}

export interface VersionAutoUpdateSettings {
  enabled: boolean;
  retainedArchiveCount: number;
}

export interface AppConfig {
  server: ServerConfig;
  codeServer?: {
    port?: number;
    password?: string;
  };
  omniroute?: {
    port?: number;
    password?: string;
  };
  versionAutoUpdate: VersionAutoUpdateSettings;
  startOnStartup: boolean;
  minimizeToTray: boolean;
  checkForUpdates: boolean;
  settings: AppSettings;
  shutdownDirectory?: string;
  recordingDirectory?: string;
  logsDirectory?: string;
}

export const DEFAULT_VERSION_AUTO_UPDATE_SETTINGS: VersionAutoUpdateSettings = {
  enabled: true,
  retainedArchiveCount: 5,
};

const CODE_SERVER_MIN_PASSWORD_LENGTH = 4;
const CODE_SERVER_MAX_PASSWORD_LENGTH = 200;
const CODE_SERVER_MIN_PORT = 1024;
const CODE_SERVER_MAX_PORT = 65535;

function buildCodeServerBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function normalizeCodeServerPassword(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const password = value.trim();
  return password.length >= CODE_SERVER_MIN_PASSWORD_LENGTH && password.length <= CODE_SERVER_MAX_PASSWORD_LENGTH
    ? password
    : null;
}

function generateDefaultCodeServerPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

function normalizeCodeServerPort(value: unknown): number | null {
  const port = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(port) && port >= CODE_SERVER_MIN_PORT && port <= CODE_SERVER_MAX_PORT
    ? port
    : null;
}

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
    this.migrateLegacyLanguagePreference();
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

  private migrateLegacyLanguagePreference(): void {
    const mutableStore = this.store as unknown as {
      get: (key: string) => unknown;
      set: (key: string, value: unknown) => void;
      delete: (key: string) => void;
    };
    const currentSettings = this.store.get('settings');
    const currentLanguage = typeof currentSettings?.language === 'string' && currentSettings.language.trim().length > 0
      ? currentSettings.language
      : undefined;
    const legacyLanguage = mutableStore.get('language');

    if (currentLanguage) {
      if (legacyLanguage !== undefined) {
        mutableStore.delete('language');
      }
      return;
    }

    if (typeof legacyLanguage === 'string' && legacyLanguage.trim().length > 0) {
      mutableStore.set('settings', {
        ...(currentSettings ?? {}),
        language: legacyLanguage.trim(),
      });
      mutableStore.delete('language');
      return;
    }

    mutableStore.set('settings', {
      ...(currentSettings ?? {}),
      language: defaultConfig.settings.language,
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

  getCodeServerConfig(): CodeServerConfigSnapshot {
    const configured = this.store.get('codeServer');
    const port = normalizeCodeServerPort(configured?.port) ?? CODE_SERVER_DEFAULT_PORT;
    const password = normalizeCodeServerPassword(configured?.password) ?? generateDefaultCodeServerPassword();

    if (configured?.port !== port || configured?.password !== password) {
      this.store.set('codeServer', {
        ...(configured ?? {}),
        port,
        password,
      });
    }

    return {
      port,
      baseUrl: buildCodeServerBaseUrl(port),
      password,
    };
  }

  /**
   * Get the underlying electron-store instance
   * This is needed for components that need direct access to the store
   */
  getStore(): Store<AppConfig> {
    return this.store;
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
    return resolveDesktopLanguageCode(this.store.get('settings')?.language ?? defaultConfig.settings.language);
  }

  /**
   * Set current language
   */
  setCurrentLanguage(language: string): void {
    const currentSettings = this.store.get('settings') ?? defaultConfig.settings;
    this.store.set('settings', {
      ...currentSettings,
      language: resolveDesktopLanguageCode(language),
    });
    (this.store as unknown as { delete: (key: string) => void }).delete('language');
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
