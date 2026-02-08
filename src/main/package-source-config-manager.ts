import Store from 'electron-store';
import log from 'electron-log';

/**
 * Package source configuration with metadata
 */
export interface StoredPackageSourceConfig {
  type: 'local-folder' | 'github-release' | 'http-index';
  id: string;
  name?: string;
  createdAt: string;
  lastUsedAt?: string;
  // Local folder source properties
  path?: string;
  // GitHub release source properties
  owner?: string;
  repo?: string;
  token?: string;
  // HTTP index source properties
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

    // Initialize with default source if none exists
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
      const sources = this.store.get('sources', []);
      return sources;
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
      const activeSourceId = this.store.get('activeSourceId');
      if (!activeSourceId) {
        // Return default source if no active source is set
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
      const defaultSourceId = this.store.get('defaultSourceId');
      if (defaultSourceId) {
        return this.getSourceById(defaultSourceId);
      }

      // If no default source is set, return the first available source
      const sources = this.getAllSources();
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

      // Update last used timestamp
      const sources = this.getAllSources();
      const updatedSources = sources.map(s =>
        s.id === id ? { ...s, lastUsedAt: new Date().toISOString() } : s
      );
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
      const newSource: StoredPackageSourceConfig = {
        ...config,
        id: this.generateSourceId(),
        createdAt: new Date().toISOString(),
      };

      sources.push(newSource);
      this.store.set('sources', sources);

      // Set as default if this is the first source
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

      sources[index] = { ...sources[index], ...updates };
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

      // Update active source if needed
      const activeSourceId = this.store.get('activeSourceId');
      if (activeSourceId === id) {
        // Set new active source to first available or null
        const newActiveSource = filteredSources.length > 0 ? filteredSources[0].id : null;
        this.store.set('activeSourceId', newActiveSource);
      }

      // Update default source if needed
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
      if (sources.length === 0) {
        // In production, use HTTP index as default source
        // In development, use local folder source
        const defaultSource = process.env.NODE_ENV === 'development'
          ? this.addSource({
              type: 'local-folder',
              name: '本地文件夹',
              path: '/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/',
            })
          : this.addSource({
              type: 'http-index',
              name: 'HagiCode 官方源',
              indexUrl: 'https://server.dl.hagicode.com/index.json',
            });

        log.info('[PackageSourceConfigManager] Default source initialized:', defaultSource.id);
      }
    } catch (error) {
      log.error('[PackageSourceConfigManager] Failed to initialize default source:', error);
    }
  }

  /**
   * Get default GitHub Releases source configuration
   */
  getDefaultGitHubSource(): StoredPackageSourceConfig {
    return {
      id: 'github-default',
      type: 'github-release',
      name: 'HagiCode Releases',
      owner: 'HagiCode-org',
      repo: 'releases',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get default HTTP Index source configuration
   */
  getDefaultHttpIndexSource(): StoredPackageSourceConfig {
    return {
      id: 'http-index-default',
      type: 'http-index',
      name: 'HagiCode 官方源',
      indexUrl: 'https://server.dl.hagicode.com/index.json',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get default production path for packages
   */
  private getDefaultProductionPath(): string {
    const { app } = require('electron');
    return require('node:path').join(app.getPath('userData'), 'packages');
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
}
