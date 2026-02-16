import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import { PathManager, Platform } from './path-manager.js';

export interface AppConfig {
  DataDir?: string;
  [key: string]: any;
}

/**
 * ConfigManager handles YAML configuration file operations.
 * Provides methods to read, write, and update application configuration.
 */
export class ConfigManager {
  private pathManager: PathManager;

  constructor() {
    this.pathManager = PathManager.getInstance();
  }
  /**
   * Read appsettings.yml configuration file
   * @param configPath - Path to the configuration file
   * @returns Parsed configuration object
   * @throws Error if file cannot be read or parsed
   */
  async readConfig(configPath: string): Promise<AppConfig> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(content) as AppConfig;

      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration format');
      }

      return config;
    } catch (error) {
      log.error('[ConfigManager] Failed to read config:', error);
      throw new Error(`Failed to read configuration file: ${error}`);
    }
  }

  /**
   * Write configuration to appsettings.yml
   * @param configPath - Path to the configuration file
   * @param config - Configuration object to write
   * @throws Error if file cannot be written
   */
  async writeConfig(configPath: string, config: AppConfig): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });

      // Sanitize config to handle Windows paths properly
      const sanitizedConfig = this.sanitizeConfigForYaml(config);

      // Convert to YAML with proper formatting
      const content = yaml.dump(sanitizedConfig, {
        indent: 2,
        lineWidth: -1,
        sortKeys: false,
        quotingType: '"',
        forceQuotes: false,
      });

      await fs.writeFile(configPath, content, 'utf-8');
      log.info('[ConfigManager] Configuration written:', configPath);
    } catch (error) {
      log.error('[ConfigManager] Failed to write config:', error);
      throw new Error(`Failed to write configuration file: ${error}`);
    }
  }

  /**
   * Escape Windows path backslashes for YAML double-quoted strings
   * Converts C:\Users\... to C:\\Users\...
   */
  private escapePathForYaml(filePath: string): string {
    return filePath.replace(/\\/g, '\\\\');
  }

  /**
   * Sanitize config object to handle Windows paths properly
   * Recursively processes strings that look like file paths
   */
  private sanitizeConfigForYaml(config: any): any {
    if (typeof config === 'string') {
      // Check if this looks like a Windows path (contains drive letter and backslashes)
      if (/^[A-Za-z]:\\/.test(config) || config.includes('\\')) {
        return this.escapePathForYaml(config);
      }
      return config;
    } else if (Array.isArray(config)) {
      return config.map(item => this.sanitizeConfigForYaml(item));
    } else if (config !== null && typeof config === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(config)) {
        sanitized[key] = this.sanitizeConfigForYaml(value);
      }
      return sanitized;
    }
    return config;
  }

  /**
   * Update DataDir configuration in appsettings.yml
   * Config is stored in the installed version's config directory
   * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
   * @param dataDir - Absolute path to data directory
   * @throws Error if configuration cannot be updated
   */
  async updateDataDir(versionId: string, dataDir: string): Promise<void> {
    // Config file is stored in the installed version's config directory
    const configPath = this.pathManager.getAppSettingsPath(versionId);

    try {
      // Read existing configuration or create new one
      let config: AppConfig;
      try {
        config = await this.readConfig(configPath);
      } catch {
        // Config doesn't exist yet, create new one
        config = {};
      }

      // Update DataDir with absolute path (escape backslashes for YAML)
      config.DataDir = dataDir;

      // Escape backslashes for YAML compatibility
      const escapedDataDir = this.escapePathForYaml(dataDir);

      // Check if file exists and has content
      let existingContent = '';
      try {
        existingContent = await fs.readFile(configPath, 'utf-8');
      } catch {
        // File doesn't exist, will create new one
      }

      // If file exists and is not empty, append DataDir to it
      if (existingContent.trim()) {
        // Check if DataDir already exists in the file
        if (existingContent.includes('DataDir:')) {
          // Replace existing DataDir
          const updatedContent = existingContent.replace(
            /DataDir:\s*"[^"]*"/,
            `DataDir: "${escapedDataDir}"`
          );
          await fs.writeFile(configPath, updatedContent, 'utf-8');
        } else {
          // Append DataDir to the end of the file
          const updatedContent = existingContent.trimEnd() + `\n\n# Data directory configuration\nDataDir: "${escapedDataDir}"\n`;
          await fs.writeFile(configPath, updatedContent, 'utf-8');
        }
      } else {
        // File is empty or doesn't exist, create new config file with just DataDir
        const content = `# Data directory configuration\nDataDir: "${escapedDataDir}"\n`;
        await fs.writeFile(configPath, content, 'utf-8');
      }

      log.info('[ConfigManager] DataDir configured:', dataDir, 'in file:', configPath);
    } catch (error) {
      log.error('[ConfigManager] Failed to update DataDir:', error);
      throw error;
    }
  }
}
