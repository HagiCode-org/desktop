import Store from 'electron-store';
import log from 'electron-log';
import {
  OFFICIAL_SERVER_HTTP_INDEX_URL,
  normalizeOfficialServerHttpIndexUrl,
} from '../shared/package-source-defaults.js';

const DEFAULT_HTTP_INDEX_SOURCE_ID = 'http-index-default';
const DEFAULT_HTTP_INDEX_NAME = 'HagiCode 官方源';

/**
 * Package source configuration with metadata
 */
export interface StoredPackageSourceConfig {
  type: 'local-folder' | 'http-index';
  id: string;
  name?: string;
  createdAt: string;
  lastUsedAt?: string;
  /** Default release channel for this source (e.g., "stable", "beta", "alpha").
   * Used when filtering or displaying versions from this source. */
  defaultChannel?: string;
  // Local folder source properties
  path?: string;
  // HTTP index source properties
  indexUrl?: string;
  baseUrl?: string;
  httpAuthToken?: string;
}

interface RawStoredPackageSourceConfig {
  type?: string;
  id?: string;
  name?: string;
  createdAt?: string;
  lastUsedAt?: string;
  defaultChannel?: string;
  path?: string;
  owner?: string;
  repo?: string;
  token?: string;
  indexUrl?: string;
  baseUrl?: string;
  httpAuthToken?: string;
}

/**
 * Package source store schema
 */
interface PackageSourceStoreSchema {
  sources: StoredPackageSourceConfig[];
  activeSourceId: string | null;
  defaultSourceId: string | null;
}

/**
 * Default package source configuration store key
 */
const PACKAGE_SOURCE_STORE_KEY = 'package-sources';

/**
 * PackageSourceConfigManager handles persistence of package source configurations
 * Uses electron-store for cross-platform configuration storage
 */
export class PackageSourceConfigManager {
  private store: Store<PackageSourceStoreSchema>;

  constructor(store?: Store<Record<string, unknown>>) {
    // Use provided store or create new one with schema
    if (store) {
      this.store = store as unknown as Store<PackageSourceStoreSchema>;
    } else {
      this.store = new Store<PackageSourceStoreSchema>({
        name: PACKAGE_SOURCE_STORE_KEY,
        defaults: {
          sources: [],
          activeSourceId: null,
          defaultSourceId: null,
        },
      });
    }

    this.reconcileStoredSources();
    this.initializeDefaultSource();
  }

  /**
   * Get the electron-store instance
   */
  getStore(): Store<PackageSourceStoreSchema> {
    return this.store;
  }

  /**
   * Get all stored package source configurations
   */
  getAllSources(): StoredPackageSourceConfig[] {
    try {
      this.reconcileStoredSources();
      return this.readSupportedSources();
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to get sources:', error);
      return [];
    }
  }

  /**
   * Get a specific source by ID
   */
  getSourceById(id: string): StoredPackageSourceConfig | null {
    try {
      const sources = this.getAllSources();
      return sources.find(source => source.id === id) || null;
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to get source by ID:', error);
      return null;
    }
  }

  /**
   * Get the active package source configuration
   */
  getActiveSource(): StoredPackageSourceConfig | null {
    try {
      this.reconcileStoredSources();
      const activeSourceId = this.store.get('activeSourceId');
      if (!activeSourceId) {
        return this.getDefaultSource();
      }
      return this.getSourceById(activeSourceId);
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to get active source:', error);
      return this.getDefaultSource();
    }
  }

  /**
   * Get the default package source configuration
   */
  getDefaultSource(): StoredPackageSourceConfig | null {
    try {
      this.reconcileStoredSources();
      const defaultSourceId = this.store.get('defaultSourceId');
      if (defaultSourceId) {
        return this.getSourceById(defaultSourceId);
      }

      const sources = this.readSupportedSources();
      return sources.length > 0 ? sources[0] : null;
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to get default source:', error);
      return null;
    }
  }

  /**
   * Set the active package source
   */
  setActiveSource(id: string): boolean {
    try {
      const source = this.getSourceById(id);
      if (!source) {
        log.warn('[PackageSourceConfigManager] Source not found:', id);
        return false;
      }

      this.store.set('activeSourceId', id);

      const sources = this.getAllSources();
      const updatedSources = sources.map((storedSource) => (
        storedSource.id === id
          ? { ...storedSource, lastUsedAt: new Date().toISOString() }
          : storedSource
      ));
      this.store.set('sources', updatedSources);

      log.info('[PackageSourceConfigManager] Active source set:', id);
      return true;
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to set active source:', error);
      return false;
    }
  }

  /**
   * Add a new package source configuration
   */
  addSource(config: Omit<StoredPackageSourceConfig, 'id' | 'createdAt'>): StoredPackageSourceConfig {
    try {
      const sources = this.getAllSources();
      const normalizedConfig = this.normalizeWritableConfig(config);
      const newSource: StoredPackageSourceConfig = {
        ...normalizedConfig,
        id: this.generateSourceId(),
        createdAt: new Date().toISOString(),
      };

      sources.push(newSource);
      this.store.set('sources', sources);

      if (sources.length === 1) {
        this.store.set('defaultSourceId', newSource.id);
        this.store.set('activeSourceId', newSource.id);
      }

      log.info('[PackageSourceConfigManager] Source added:', newSource.id);
      return newSource;
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to add source:', error);
      throw error;
    }
  }

  /**
   * Update an existing package source configuration
   */
  updateSource(id: string, updates: Partial<Omit<StoredPackageSourceConfig, 'id' | 'createdAt'>>): boolean {
    try {
      const sources = this.getAllSources();
      const index = sources.findIndex(source => source.id === id);

      if (index === -1) {
        log.warn('[PackageSourceConfigManager] Source not found for update:', id);
        return false;
      }

      const merged = this.normalizeWritableConfig({
        ...sources[index],
        ...updates,
      });

      sources[index] = {
        ...sources[index],
        ...merged,
      };
      this.store.set('sources', sources);

      log.info('[PackageSourceConfigManager] Source updated:', id);
      return true;
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to update source:', error);
      return false;
    }
  }

  /**
   * Remove a package source configuration
   */
  removeSource(id: string): boolean {
    try {
      const sources = this.getAllSources();
      const filteredSources = sources.filter(source => source.id !== id);

      if (filteredSources.length === sources.length) {
        log.warn('[PackageSourceConfigManager] Source not found for removal:', id);
        return false;
      }

      this.store.set('sources', filteredSources);

      const activeSourceId = this.store.get('activeSourceId');
      if (activeSourceId === id) {
        const newActiveSource = filteredSources.length > 0 ? filteredSources[0].id : null;
        this.store.set('activeSourceId', newActiveSource);
      }

      const defaultSourceId = this.store.get('defaultSourceId');
      if (defaultSourceId === id) {
        const newDefaultSource = filteredSources.length > 0 ? filteredSources[0].id : null;
        this.store.set('defaultSourceId', newDefaultSource);
      }

      log.info('[PackageSourceConfigManager] Source removed:', id);
      return true;
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to remove source:', error);
      return false;
    }
  }

  getDefaultHttpIndexSource(): StoredPackageSourceConfig {
    return this.createDefaultHttpIndexSource();
  }

  /**
   * Clear all package source configurations (useful for testing)
   */
  clearAllSources(): void {
    try {
      this.store.set('sources', []);
      this.store.set('activeSourceId', null);
      this.store.set('defaultSourceId', null);
      log.info('[PackageSourceConfigManager] All sources cleared');
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to clear sources:', error);
    }
  }

  /**
   * Generate a unique source ID
   */
  private generateSourceId(): string {
    const sources = this.getAllSources();
    let counter = sources.length + 1;
    let id = `source-${counter}`;

    while (sources.some(source => source.id === id)) {
      counter++;
      id = `source-${counter}`;
    }

    return id;
  }

  /**
   * Initialize default package source if none exists
   */
  private initializeDefaultSource(): void {
    try {
      const sources = this.getAllSources();
      if (sources.length > 0) {
        return;
      }

      const overrideConfig = this.loadEnvironmentOverride();
      if (overrideConfig) {
        const defaultSource = this.addSource(overrideConfig);
        log.info('[PackageSourceConfigManager] Default source initialized from environment override:', defaultSource.id);
        return;
      }

      const defaultSource = this.addSource(this.createDefaultHttpIndexConfig());
      log.info('[PackageSourceConfigManager] Default source initialized:', defaultSource.id);
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to initialize default source:', error);
    }
  }

  /**
   * Load package source configuration from environment variable
   * Supports UPDATE_SOURCE_OVERRIDE environment variable with JSON configuration
   */
  private loadEnvironmentOverride(): Omit<StoredPackageSourceConfig, 'id' | 'createdAt'> | null {
    const overrideEnv = process.env.UPDATE_SOURCE_OVERRIDE;
    if (!overrideEnv) {
      return null;
    }

    try {
      const overrideConfig = JSON.parse(overrideEnv) as RawStoredPackageSourceConfig;

      if (!overrideConfig.type) {
        log.warn('[PackageSourceConfigManager] Invalid override configuration: missing type field');
        return null;
      }

      if (overrideConfig.type === 'github-release') {
        log.warn('[PackageSourceConfigManager] UPDATE_SOURCE_OVERRIDE no longer supports github-release; falling back to default http-index source');
        return this.createDefaultHttpIndexConfig();
      }

      if (overrideConfig.type !== 'local-folder' && overrideConfig.type !== 'http-index') {
        log.warn('[PackageSourceConfigManager] Invalid override configuration: unsupported type:', overrideConfig.type);
        return null;
      }

      if (overrideConfig.type === 'local-folder') {
        if (!overrideConfig.path) {
          log.warn('[PackageSourceConfigManager] Invalid override configuration: local-folder requires path');
          return null;
        }
        return {
          type: 'local-folder',
          name: overrideConfig.name,
          defaultChannel: overrideConfig.defaultChannel,
          lastUsedAt: overrideConfig.lastUsedAt,
          path: overrideConfig.path,
        };
      }

      if (!overrideConfig.indexUrl) {
        log.warn('[PackageSourceConfigManager] Invalid override configuration: http-index requires indexUrl');
        return null;
      }

      return {
        type: 'http-index',
        name: overrideConfig.name,
        defaultChannel: overrideConfig.defaultChannel,
        lastUsedAt: overrideConfig.lastUsedAt,
        indexUrl: normalizeOfficialServerHttpIndexUrl(overrideConfig.indexUrl),
        baseUrl: overrideConfig.baseUrl,
        httpAuthToken: overrideConfig.httpAuthToken,
      };
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to parse UPDATE_SOURCE_OVERRIDE environment variable:', error);
      return null;
    }
  }

  private reconcileStoredSources(): void {
    const rawSources = this.readRawSources();
    const previousActiveSourceId = this.store.get('activeSourceId');
    const previousDefaultSourceId = this.store.get('defaultSourceId');

    let hadLegacyGithubSource = false;
    let mutated = false;

    const supportedSources = rawSources.flatMap((rawSource) => {
      const normalized = this.normalizeStoredSource(rawSource);
      if (rawSource.type === 'github-release') {
        hadLegacyGithubSource = true;
        mutated = true;
      } else if (!normalized) {
        mutated = true;
      } else if (this.didNormalizeStoredSourceChange(rawSource, normalized)) {
        mutated = true;
      }

      return normalized ? [normalized] : [];
    });

    if (supportedSources.length === 0 && rawSources.length > 0) {
      supportedSources.push(this.createDefaultHttpIndexSource());
      mutated = true;
    }

    let fallbackHttpIndex = supportedSources.find(source => source.type === 'http-index');
    if (!fallbackHttpIndex && hadLegacyGithubSource) {
      fallbackHttpIndex = this.createDefaultHttpIndexSource();
      supportedSources.push(fallbackHttpIndex);
      mutated = true;
    }

    const supportedIds = new Set(supportedSources.map(source => source.id));

    const nextDefaultSourceId = this.resolvePreferredSourceId({
      currentId: previousDefaultSourceId,
      supportedSources,
      supportedIds,
      preferHttpIndex: hadLegacyGithubSource,
      fallbackHttpIndex,
    });

    const nextActiveSourceId = this.resolvePreferredSourceId({
      currentId: previousActiveSourceId,
      supportedSources,
      supportedIds,
      preferHttpIndex: hadLegacyGithubSource,
      fallbackHttpIndex,
      secondaryId: nextDefaultSourceId,
    });

    if (!mutated
      && previousActiveSourceId === nextActiveSourceId
      && previousDefaultSourceId === nextDefaultSourceId) {
      return;
    }

    this.store.set('sources', supportedSources);
    this.store.set('defaultSourceId', nextDefaultSourceId);
    this.store.set('activeSourceId', nextActiveSourceId);

    if (hadLegacyGithubSource) {
      log.info('[PackageSourceConfigManager] Migrated legacy github-release source to supported fallback:', nextActiveSourceId);
    }
  }

  private resolvePreferredSourceId(params: {
    currentId: string | null;
    secondaryId?: string | null;
    supportedSources: StoredPackageSourceConfig[];
    supportedIds: Set<string>;
    preferHttpIndex: boolean;
    fallbackHttpIndex?: StoredPackageSourceConfig;
  }): string | null {
    const {
      currentId,
      secondaryId,
      supportedSources,
      supportedIds,
      preferHttpIndex,
      fallbackHttpIndex,
    } = params;

    if (currentId && supportedIds.has(currentId)) {
      return currentId;
    }

    if (preferHttpIndex && fallbackHttpIndex) {
      return fallbackHttpIndex.id;
    }

    if (secondaryId && supportedIds.has(secondaryId)) {
      return secondaryId;
    }

    return supportedSources[0]?.id ?? null;
  }

  private readSupportedSources(): StoredPackageSourceConfig[] {
    const sources = this.store.get('sources', []);
    return Array.isArray(sources) ? sources : [];
  }

  private readRawSources(): RawStoredPackageSourceConfig[] {
    const sources = this.store.get('sources', []) as unknown;
    return Array.isArray(sources) ? sources as RawStoredPackageSourceConfig[] : [];
  }

  private normalizeStoredSource(rawSource: RawStoredPackageSourceConfig): StoredPackageSourceConfig | null {
    if (rawSource.type === 'local-folder') {
      if (!rawSource.path) {
        log.warn('[PackageSourceConfigManager] Dropping invalid local-folder source without path:', rawSource.id);
        return null;
      }

      return {
        type: 'local-folder',
        id: rawSource.id || this.generateRecoveredSourceId('local-folder'),
        name: rawSource.name,
        createdAt: rawSource.createdAt || new Date().toISOString(),
        lastUsedAt: rawSource.lastUsedAt,
        defaultChannel: rawSource.defaultChannel,
        path: rawSource.path,
      };
    }

    if (rawSource.type === 'http-index') {
      if (!rawSource.indexUrl) {
        log.warn('[PackageSourceConfigManager] Dropping invalid http-index source without indexUrl:', rawSource.id);
        return null;
      }

      return {
        type: 'http-index',
        id: rawSource.id || this.generateRecoveredSourceId('http-index'),
        name: rawSource.name,
        createdAt: rawSource.createdAt || new Date().toISOString(),
        lastUsedAt: rawSource.lastUsedAt,
        defaultChannel: rawSource.defaultChannel,
        indexUrl: normalizeOfficialServerHttpIndexUrl(rawSource.indexUrl),
        baseUrl: rawSource.baseUrl,
        httpAuthToken: rawSource.httpAuthToken,
      };
    }

    if (rawSource.type === 'github-release') {
      return null;
    }

    if (rawSource.type) {
      log.warn('[PackageSourceConfigManager] Dropping unsupported package source type:', rawSource.type);
    }
    return null;
  }

  private normalizeWritableConfig(
    config: Partial<Omit<StoredPackageSourceConfig, 'id' | 'createdAt'>>,
  ): Omit<StoredPackageSourceConfig, 'id' | 'createdAt'> {
    if (config.type === 'local-folder') {
      if (!config.path) {
        throw new Error('Local folder source requires a path');
      }

      return {
        type: 'local-folder',
        name: config.name,
        lastUsedAt: config.lastUsedAt,
        defaultChannel: config.defaultChannel,
        path: config.path,
      };
    }

    if (config.type === 'http-index') {
      if (!config.indexUrl) {
        throw new Error('HTTP index source requires an indexUrl');
      }

      return {
        type: 'http-index',
        name: config.name,
        lastUsedAt: config.lastUsedAt,
        defaultChannel: config.defaultChannel,
        indexUrl: normalizeOfficialServerHttpIndexUrl(config.indexUrl),
        baseUrl: config.baseUrl,
        httpAuthToken: config.httpAuthToken,
      };
    }

    throw new Error(`Package source type ${(config as { type?: string }).type ?? 'undefined'} is no longer supported`);
  }

  private createDefaultHttpIndexConfig(): Omit<StoredPackageSourceConfig, 'id' | 'createdAt'> {
    return {
      type: 'http-index',
      name: DEFAULT_HTTP_INDEX_NAME,
      indexUrl: OFFICIAL_SERVER_HTTP_INDEX_URL,
    };
  }

  private createDefaultHttpIndexSource(): StoredPackageSourceConfig {
    return {
      id: DEFAULT_HTTP_INDEX_SOURCE_ID,
      type: 'http-index',
      name: DEFAULT_HTTP_INDEX_NAME,
      indexUrl: OFFICIAL_SERVER_HTTP_INDEX_URL,
      createdAt: new Date().toISOString(),
    };
  }

  private generateRecoveredSourceId(type: StoredPackageSourceConfig['type']): string {
    return `${type}-recovered-${Date.now()}`;
  }

  private didNormalizeStoredSourceChange(
    rawSource: RawStoredPackageSourceConfig,
    normalized: StoredPackageSourceConfig,
  ): boolean {
    if (rawSource.id !== normalized.id || rawSource.createdAt !== normalized.createdAt) {
      return true;
    }

    if (rawSource.type !== normalized.type) {
      return true;
    }

    if (rawSource.name !== normalized.name || rawSource.lastUsedAt !== normalized.lastUsedAt) {
      return true;
    }

    if (rawSource.defaultChannel !== normalized.defaultChannel) {
      return true;
    }

    if (normalized.type === 'local-folder') {
      return rawSource.path !== normalized.path;
    }

    return rawSource.indexUrl !== normalized.indexUrl
      || rawSource.baseUrl !== normalized.baseUrl
      || rawSource.httpAuthToken !== normalized.httpAuthToken;
  }
}
