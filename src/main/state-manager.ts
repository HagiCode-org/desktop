import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import log from 'electron-log';

/**
 * State data structures
 */
export interface InstalledVersionInfo {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'installed-incomplete';
  dependencies: any[];
  isActive: boolean;
}

export interface ActiveVersionInfo {
  versionId: string;
  switchedAt: string;
}

/**
 * StateManager handles all state/persistence for the Hagicode Desktop application
 * State is stored in the config/state/ directory
 */
export class StateManager {
  private statePath: string;
  private versionsPath: string;
  private dependenciesPath: string;
  private installedVersionsPath: string;
  private activeVersionPath: string;

  constructor() {
    // Use userDataPath/config/state/ for state files
    const userDataPath = app.getPath('userData');
    this.statePath = path.join(userDataPath, 'config', 'state');
    this.versionsPath = path.join(this.statePath, 'versions');
    this.dependenciesPath = path.join(this.statePath, 'dependencies.json');
    this.installedVersionsPath = path.join(this.versionsPath, 'installed.json');
    this.activeVersionPath = path.join(this.versionsPath, 'active.json');

    // Initialize directories
    this.initializeDirectories();
  }

  /**
   * Initialize state directories
   */
  private async initializeDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.statePath, { recursive: true });
      await fs.mkdir(this.versionsPath, { recursive: true });
    } catch (error) {
      log.error('[StateManager] Failed to initialize directories:', error);
    }
  }

  /**
   * Get all installed versions
   */
  async getInstalledVersions(): Promise<InstalledVersionInfo[]> {
    try {
      await this.initializeDirectories();
      const content = await fs.readFile(this.installedVersionsPath, 'utf-8');
      const versions = JSON.parse(content);
      return versions || [];
    } catch (error) {
      // File doesn't exist yet, return empty array
      return [];
    }
  }

  /**
   * Set installed versions
   */
  async setInstalledVersions(versions: InstalledVersionInfo[]): Promise<void> {
    try {
      await this.initializeDirectories();
      const content = JSON.stringify(versions, null, 2);
      await fs.writeFile(this.installedVersionsPath, content, 'utf-8');
      log.info('[StateManager] Saved', versions.length, 'installed versions');
    } catch (error) {
      log.error('[StateManager] Failed to save installed versions:', error);
      throw error;
    }
  }

  /**
   * Get a specific installed version
   */
  async getInstalledVersion(versionId: string): Promise<InstalledVersionInfo | null> {
    try {
      const versions = await this.getInstalledVersions();
      return versions.find(v => v.id === versionId) || null;
    } catch (error) {
      log.error('[StateManager] Failed to get installed version:', error);
      return null;
    }
  }

  /**
   * Add or update an installed version
   */
  async setInstalledVersion(version: InstalledVersionInfo): Promise<void> {
    try {
      const versions = await this.getInstalledVersions();
      const index = versions.findIndex(v => v.id === version.id);

      if (index >= 0) {
        versions[index] = version;
      } else {
        versions.push(version);
      }

      await this.setInstalledVersions(versions);
    } catch (error) {
      log.error('[StateManager] Failed to set installed version:', error);
      throw error;
    }
  }

  /**
   * Remove an installed version
   */
  async removeInstalledVersion(versionId: string): Promise<void> {
    try {
      const versions = await this.getInstalledVersions();
      const filtered = versions.filter(v => v.id !== versionId);
      await this.setInstalledVersions(filtered);
      log.info('[StateManager] Removed version:', versionId);
    } catch (error) {
      log.error('[StateManager] Failed to remove installed version:', error);
      throw error;
    }
  }

  /**
   * Get active version
   */
  async getActiveVersion(): Promise<ActiveVersionInfo | null> {
    try {
      await this.initializeDirectories();
      const content = await fs.readFile(this.activeVersionPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // File doesn't exist yet
      return null;
    }
  }

  /**
   * Set active version
   */
  async setActiveVersion(versionId: string): Promise<void> {
    try {
      await this.initializeDirectories();
      const activeVersion: ActiveVersionInfo = {
        versionId,
        switchedAt: new Date().toISOString(),
      };
      const content = JSON.stringify(activeVersion, null, 2);
      await fs.writeFile(this.activeVersionPath, content, 'utf-8');
      log.info('[StateManager] Set active version:', versionId);
    } catch (error) {
      log.error('[StateManager] Failed to set active version:', error);
      throw error;
    }
  }

  /**
   * Clear active version
   */
  async clearActiveVersion(): Promise<void> {
    try {
      await fs.unlink(this.activeVersionPath);
      log.info('[StateManager] Cleared active version');
    } catch (error) {
      // File doesn't exist, that's fine
      log.debug('[StateManager] Active version file does not exist');
    }
  }

  /**
   * Get all state (for debugging/backup)
   */
  async exportState(): Promise<Record<string, any>> {
    try {
      const [installedVersions, activeVersion] = await Promise.all([
        this.getInstalledVersions(),
        this.getActiveVersion(),
      ]);

      return {
        installedVersions,
        activeVersion,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      log.error('[StateManager] Failed to export state:', error);
      return {};
    }
  }
}
