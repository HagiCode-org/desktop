import log from 'electron-log';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { ConfigManager } from './config.js';
import type { LicenseData } from '../types/license.js';
import { DEFAULT_LICENSE_KEY } from '../types/license.js';
import { PathManager } from './path-manager.js';

/**
 * License sync status information
 */
export interface LicenseSyncStatus {
  synced: boolean;
  licenseKey?: string;
  isDefault?: boolean;
  source: 'existing' | 'default' | 'manual';
  timestamp: string;
  syncedVersions?: number; // Number of versions that were synced
}

/**
 * License Manager (Singleton)
 * Manages global license configuration
 */
export class LicenseManager {
  private static instance: LicenseManager | null = null;
  private configManager: ConfigManager;
  private syncStatusCallback?: (status: LicenseSyncStatus) => void;
  private pathManager: PathManager;

  private constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.pathManager = PathManager.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(configManager: ConfigManager): LicenseManager {
    if (!LicenseManager.instance) {
      LicenseManager.instance = new LicenseManager(configManager);
    }
    return LicenseManager.instance;
  }

  /**
   * Register callback for license sync status changes
   */
  onSyncStatus(callback: (status: LicenseSyncStatus) => void): void {
    this.syncStatusCallback = callback;
  }

  /**
   * Emit sync status to registered callback
   */
  private emitSyncStatus(status: LicenseSyncStatus): void {
    if (this.syncStatusCallback) {
      this.syncStatusCallback(status);
    }
  }

  /**
   * Get current license
   */
  getLicense(): LicenseData | null {
    try {
      const config = this.configManager.getLicense();
      if (!config || !config.isConfigured) {
        return null;
      }
      return {
        licenseKey: config.licenseKey,
        isConfigured: config.isConfigured,
        updatedAt: config.updatedAt,
      };
    } catch (error) {
      log.error('[LicenseManager] Failed to get license:', error);
      return null;
    }
  }

  /**
   * Save license
   */
  async saveLicense(licenseKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!licenseKey || licenseKey.trim() === '') {
        return {
          success: false,
          error: 'License key cannot be empty',
        };
      }

      const trimmedKey = licenseKey.trim();
      this.configManager.setLicense(trimmedKey);

      const isDefault = trimmedKey === DEFAULT_LICENSE_KEY;

      log.info('[LicenseManager] License saved successfully:', {
        key: this.maskLicenseKey(trimmedKey),
        isDefault,
        source: 'manual',
        timestamp: new Date().toISOString()
      });

      // Sync to AppSettings.yml for all installed versions
      const syncResults = await this.syncToAppSettings(trimmedKey);

      // Emit sync status
      this.emitSyncStatus({
        synced: true,
        licenseKey: trimmedKey,
        isDefault,
        source: 'manual',
        timestamp: new Date().toISOString(),
        syncedVersions: syncResults.length
      });

      return { success: true };
    } catch (error) {
      log.error('[LicenseManager] Failed to save license:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save license',
      };
    }
  }

  /**
   * Initialize default license if not configured
   */
  async initializeDefaultLicense(): Promise<void> {
    try {
      const current = this.getLicense();
      const timestamp = new Date().toISOString();

      if (!current || !current.isConfigured) {
        log.info('[LicenseManager] No existing license found, initializing default license');
        this.configManager.setLicense(DEFAULT_LICENSE_KEY);

        const syncResults = await this.syncToAppSettings(DEFAULT_LICENSE_KEY);

        const syncStatus: LicenseSyncStatus = {
          synced: true,
          licenseKey: DEFAULT_LICENSE_KEY,
          isDefault: true,
          source: 'default',
          timestamp,
          syncedVersions: syncResults.length
        };

        log.info('[LicenseManager] License sync completed:', {
          ...syncStatus,
          key: this.maskLicenseKey(DEFAULT_LICENSE_KEY),
          versions: syncResults
        });

        this.emitSyncStatus(syncStatus);
      } else {
        // Sync existing license to AppSettings
        const syncResults = await this.syncToAppSettings(current.licenseKey);

        const syncStatus: LicenseSyncStatus = {
          synced: true,
          licenseKey: current.licenseKey,
          isDefault: current.licenseKey === DEFAULT_LICENSE_KEY,
          source: 'existing',
          timestamp: current.updatedAt || timestamp,
          syncedVersions: syncResults.length
        };

        log.info('[LicenseManager] License sync completed (existing):', {
          ...syncStatus,
          key: this.maskLicenseKey(current.licenseKey),
          versions: syncResults
        });

        this.emitSyncStatus(syncStatus);
      }
    } catch (error) {
      log.error('[LicenseManager] Failed to initialize default license:', error);
    }
  }

  /**
   * Mask license key for logging (show first 8 chars only)
   */
  private maskLicenseKey(key: string): string {
    if (!key) return '';
    if (key.length <= 8) return key + '***';
    return key.substring(0, 8) + '...' + key.substring(key.length - 4);
  }

  /**
   * Check if license is configured
   */
  isConfigured(): boolean {
    const license = this.getLicense();
    return license !== null && license.isConfigured;
  }

  /**
   * Sync license to AppSettings.yml for all installed versions
   * @param licenseKey - License key to sync
   * @returns Array of version IDs that were successfully updated
   */
  async syncToAppSettings(licenseKey: string): Promise<string[]> {
    const updatedVersions: string[] = [];

    try {
      // Get all installed versions
      const installedVersionsPath = this.pathManager.getPaths().appsInstalled;

      // Check if directory exists
      try {
        await fs.access(installedVersionsPath);
      } catch {
        log.warn('[LicenseManager] Installed versions directory does not exist:', installedVersionsPath);
        return updatedVersions;
      }

      // Get all version directories
      const versionDirs = await fs.readdir(installedVersionsPath, { withFileTypes: true });
      const versionIds = versionDirs
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      log.info('[LicenseManager] Found installed versions:', versionIds.length);

      // Update each version's appsettings.yml
      for (const versionId of versionIds) {
        try {
          const configPath = this.pathManager.getAppSettingsPath(versionId);

          // Read existing config or create new one
          let config: Record<string, any> = {};
          try {
            const content = await fs.readFile(configPath, 'utf-8');
            config = yaml.load(content) as Record<string, any> || {};
          } catch {
            // Config doesn't exist, will create new one
          }

          // Ensure License object exists
          if (!config.License) {
            config.License = {};
          }

          // Ensure Activation object exists
          if (!config.License.Activation) {
            config.License.Activation = {};
          }

          // Check if license key needs updating
          if (config.License.Activation.LicenseKey !== licenseKey) {
            config.License.Activation.LicenseKey = licenseKey;

            // Write back to file
            const yamlContent = yaml.dump(config, {
              indent: 2,
              lineWidth: -1,
              sortKeys: false,
              quotingType: '"',
              forceQuotes: false,
            });

            // Ensure directory exists
            const dir = path.dirname(configPath);
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(configPath, yamlContent, 'utf-8');

            updatedVersions.push(versionId);
            log.info('[LicenseManager] License synced to License.Activation.LicenseKey in appsettings.yml for version:', versionId);
          } else {
            log.info('[LicenseManager] License already up-to-date for version:', versionId);
          }
        } catch (error) {
          log.error(`[LicenseManager] Failed to sync license for version ${versionId}:`, error);
        }
      }

      if (updatedVersions.length > 0) {
        log.info(`[LicenseManager] License synced to ${updatedVersions.length} version(s)`);
      }

    } catch (error) {
      log.error('[LicenseManager] Failed to sync license to appsettings.yml:', error);
    }

    return updatedVersions;
  }
}
