import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import log from 'electron-log';
import type {
  ClaudeConfig,
  ClaudeProvider,
  DetectedConfig,
  ValidationResult,
  CliVerificationResult,
  ClaudeConfigEnvSettings,
  ModelMapping,
  BackupInfo,
  ConfigDetectionResult,
} from '../types/claude-config.js';
import { ConfigSource, DEFAULT_MODEL_MAPPINGS } from '../types/claude-config.js';
import { getApiEndpointConfig, getApiUrl } from './lib/api-endpoints.js';

const execAsync = promisify(exec);

/**
 * ClaudeConfigManager manages Claude API configuration
 * Handles configuration detection, validation, CLI verification, and storage
 */
export class ClaudeConfigManager {
  private static readonly STORE_KEY = 'claudeConfig';
  private static readonly CLAUDE_DIR_NAME = '.claude';
  private static readonly BACKUP_RETENTION_COUNT = 10;
  private static readonly METADATA_GENERATOR = 'hagicode-desktop';
  private static readonly API_TIMEOUT_MS = '3000000';
  private static readonly DISABLE_NONESSENTIAL_TRAFFIC = 1;

  constructor(private store: any) {}

  /**
   * Detect existing Claude configuration from environment variables, settings.json, or store
   * Follows Claude Code's configuration priority rules:
   * 1. Environment variables (ANTHROPIC_AUTH_TOKEN or ZAI_API_KEY)
   * 2. settings.json (~/.claude/settings.json)
   * 3. electron-store
   */
  async detectExistingConfig(): Promise<DetectedConfig> {
    try {
      log.info('[ClaudeConfigManager] Detecting existing configuration...');

      // Priority 1: Check environment variables
      const envConfig = this.detectFromEnvironment();
      if (envConfig) {
        log.info('[ClaudeConfigManager] Found configuration from environment variables');
        return envConfig;
      }

      // Priority 2: Check settings.json
      const settingsConfig = await this.detectFromSettingsFile();
      if (settingsConfig) {
        log.info('[ClaudeConfigManager] Found configuration from settings.json');
        return settingsConfig;
      }

      // Priority 3: Check electron-store
      const storeConfig = this.detectFromStore();
      if (storeConfig) {
        log.info('[ClaudeConfigManager] Found configuration from electron-store');
        return storeConfig;
      }

      log.info('[ClaudeConfigManager] No existing configuration found');
      return {
        exists: false,
        source: 'none',
      };
    } catch (error) {
      log.error('[ClaudeConfigManager] Error detecting configuration:', error);
      return {
        exists: false,
        source: 'none',
      };
    }
  }

  /**
   * Detect configuration from environment variables
   */
  private detectFromEnvironment(): DetectedConfig | null {
    // Check various possible environment variable names
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_URL;

    // Check ZAI_API_KEY (Zhipu AI specific)
    const zaiKey = process.env.ZAI_API_KEY;

    if (!authToken && !zaiKey) {
      return null;
    }

    // Determine provider based on environment variables
    let provider: ClaudeProvider = 'anthropic'; // Default to Anthropic
    let endpoint: string | undefined;

    if (zaiKey) {
      // ZAI API key present - check ANTHROPIC_URL to confirm
      provider = 'zhipu';
      endpoint = process.env.ANTHROPIC_URL || getApiUrl('zhipu');
    } else if (baseUrl) {
      // Custom URL set - try to detect provider
      const url = baseUrl;
      if (url.includes('bigmodel.cn')) {
        provider = 'zhipu';
      } else if (url.includes('aliyuncs.com') || url.includes('dashscope.aliyuncs.com')) {
        provider = 'aliyun';
      } else if (url.includes('192.168') || url.includes('localhost') || url.includes('127.0.0.1')) {
        // Local/private endpoint
        provider = 'custom';
      } else {
        provider = 'custom';
      }
      endpoint = url;
    }

    log.info('[ClaudeConfigManager] Detected config from environment:', { provider, hasEndpoint: !!endpoint });

    return {
      exists: true,
      source: 'env',
      provider,
      apiKey: authToken || zaiKey || '',
      endpoint,
    };
  }

  /**
   * Detect configuration from Claude Code settings.json file
   */
  private async detectFromSettingsFile(): Promise<DetectedConfig | null> {
    const settingsPath = this.getClaudeSettingsPath();

    try {
      await fs.access(settingsPath);
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(content);

      // Check for API token in various possible locations
      // Claude Code settings.json structure: env.ANTHROPIC_AUTH_TOKEN or providers.anthropic.apiKey
      let apiKey = settings.env?.ANTHROPIC_AUTH_TOKEN ||
                     settings.providers?.anthropic?.apiKey ||
                     settings.apiKey ||
                     settings.ANTHROPIC_AUTH_TOKEN;

      if (!apiKey) {
        return null;
      }

      // Try to determine provider and endpoint from settings
      let provider: ClaudeProvider = 'anthropic'; // Default to Anthropic
      let endpoint: string | undefined;

      // Check for custom endpoint in various locations
      const baseUrl = settings.env?.ANTHROPIC_BASE_URL ||
                       settings.ANTHROPIC_URL ||
                       settings.baseURL;

      if (baseUrl) {
        // Detect provider based on URL
        if (baseUrl.includes('bigmodel.cn')) {
          provider = 'zhipu';
          endpoint = baseUrl;
        } else if (baseUrl.includes('aliyuncs.com') || baseUrl.includes('dashscope')) {
          provider = 'aliyun';
          endpoint = baseUrl;
        } else if (baseUrl.includes('192.168') || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
          // Local/private endpoint
          provider = 'custom';
          endpoint = baseUrl;
        } else {
          provider = 'custom';
          endpoint = baseUrl;
        }
      }

      log.info('[ClaudeConfigManager] Detected config from settings.json:', { provider, hasEndpoint: !!endpoint });

      return {
        exists: true,
        source: 'settings',
        provider,
        apiKey,
        endpoint,
      };
    } catch (error) {
      // File doesn't exist or can't be read
      log.warn('[ClaudeConfigManager] Could not read settings.json:', error);
      return null;
    }
  }

  /**
   * Detect configuration from electron-store
   */
  private detectFromStore(): DetectedConfig | null {
    const stored = this.store.get(ClaudeConfigManager.STORE_KEY) as ClaudeConfig | undefined;

    if (!stored || !stored.apiKey) {
      return null;
    }

    return {
      exists: true,
      source: 'store',
      provider: stored.provider,
      apiKey: stored.apiKey,
      endpoint: stored.endpoint,
    };
  }

  /**
   * Get the platform-specific path to Claude settings.json
   */
  private getClaudeSettingsPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, ClaudeConfigManager.CLAUDE_DIR_NAME, 'settings.json');
  }

  /**
   * Validate API key by testing with Claude CLI
   * This uses environment variables to test without modifying settings.json
   */
  async validateApiKey(
    provider: ClaudeProvider,
    apiKey: string,
    endpoint?: string
  ): Promise<ValidationResult> {
    try {
      log.info('[ClaudeConfigManager] Validating API key for provider:', provider);

      // Validate API key format before testing
      const formatError = this.validateApiKeyFormat(provider, apiKey);
      if (formatError) {
        return {
          success: false,
          error: formatError,
        };
      }

      // Set environment variables for the CLI command
      const env: Record<string, string> = {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: apiKey,
      };

      // Add endpoint URL if provided (for non-anthropic providers)
      if (endpoint && provider !== 'anthropic') {
        env.ANTHROPIC_URL = endpoint;
      } else if (provider !== 'anthropic') {
        const defaultUrl = getApiUrl(provider);
        if (defaultUrl) {
          env.ANTHROPIC_URL = defaultUrl;
        }
      }

      // Test by running claude --version with custom environment
      try {
        const { stdout, stderr: cliStderr } = await execAsync('claude --version', {
          timeout: 10000, // 10 second timeout
          env,
        });

        // Parse version from output
        const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);

        if (versionMatch) {
          const version = versionMatch[1];
          log.info('[ClaudeConfigManager] CLI validation successful, version:', version);
          return {
            success: true,
            cliVersion: version,
          };
        }

        // If no version found but command succeeded, still consider it valid
        log.info('[ClaudeConfigManager] CLI validation succeeded (no version parsed)');
        return { success: true };
      } catch (cliError: any) {
        log.error('[ClaudeConfigManager] CLI validation failed:', cliError);

        // Check for specific error messages
        const errorMessage = cliError.message || String(cliError);
        const errorStderr = cliError.stderr || '';

        if (errorMessage.includes('not found') || errorMessage.includes('ENOENT') || errorMessage.includes('command not found')) {
          return {
            success: false,
            error: 'Claude Code CLI 未安装，请先安装 Claude Code CLI',
          };
        }

        if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication')) {
          return {
            success: false,
            error: 'API Key 无效，请检查后重试',
          };
        }

        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
          return {
            success: false,
            error: '无法连接到 API 端点，请检查端点地址',
          };
        }

        // Include stderr in error if available
        const errorDetails = errorStderr ? `${errorStderr}` : errorMessage;
        return {
          success: false,
          error: `配置验证失败: ${errorDetails}`,
        };
      }
    } catch (error) {
      log.error('[ClaudeConfigManager] API key validation error:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate API key format based on provider
   */
  private validateApiKeyFormat(provider: ClaudeProvider, apiKey: string): string | null {
    if (!apiKey || apiKey.trim().length === 0) {
      return 'API Key 不能为空';
    }

    switch (provider) {
      case 'anthropic':
        // Anthropic keys start with sk-ant-
        if (!apiKey.startsWith('sk-ant-')) {
          return 'API Key 格式无效，应以 sk-ant- 开头';
        }
        break;

      case 'zhipu':
        // Zhipu AI keys typically start with sk- or have specific format
        // Basic validation - not empty and reasonable length
        if (apiKey.length < 20) {
          return 'API Key 格式无效';
        }
        break;

      case 'aliyun':
        // Aliyun keys have specific format
        if (apiKey.length < 20) {
          return 'API Key 格式无效';
        }
        break;

      case 'custom':
        // Custom endpoints - basic validation only
        if (apiKey.length < 10) {
          return 'API Key 格式无效';
        }
        break;
    }

    return null;
  }

  /**
   * Verify Claude Code CLI installation
   * Executes 'claude --version' command
   */
  async verifyCliInstallation(): Promise<CliVerificationResult> {
    try {
      log.info('[ClaudeConfigManager] Verifying Claude Code CLI installation...');

      const { stdout, stderr } = await execAsync('claude --version', {
        timeout: 10000, // 10 second timeout
      });

      // Parse version from output
      const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);

      if (versionMatch) {
        const version = versionMatch[1];
        log.info('[ClaudeConfigManager] Claude Code CLI found, version:', version);

        return {
          installed: true,
          version,
          path: await this.findCliPath(),
        };
      }

      log.warn('[ClaudeConfigManager] CLI not installed or invalid output');
      return {
        installed: false,
        error: 'Claude Code CLI 未安装',
      };
    } catch (error) {
      log.error('[ClaudeConfigManager] CLI verification error:', error);

      // Command not found
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('ENOENT')) {
          return {
            installed: false,
            error: 'Claude Code CLI 未安装',
          };
        }
      }

      return {
        installed: false,
        error: 'CLI 验证失败',
      };
    }
  }

  /**
   * Find the path to Claude CLI executable
   */
  private async findCliPath(): Promise<string | undefined> {
    try {
      // Try to find where claude command is located
      const { stdout } = await execAsync(process.platform === 'win32' ? 'where claude' : 'which claude');
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Save Claude configuration to electron-store
   * Stores encrypted API key
   */
  async saveConfig(config: ClaudeConfig): Promise<{ success: boolean; error?: string; backupPath?: string }> {
    try {
      log.info('[ClaudeConfigManager] Saving configuration...');

      // Check if we should preserve existing config
      const shouldPreserve = await this.shouldPreserveExistingConfig();

      if (shouldPreserve) {
        const detectionResult = await this.detectConfigSource();
        log.info('[ClaudeConfigManager] Preserving existing config, source:', detectionResult);

        // Still save to store for app usage
        const configToSave: ClaudeConfig = {
          ...config,
          validatedAt: new Date().toISOString(),
          lastValidationStatus: 'success',
        };
        this.store.set(ClaudeConfigManager.STORE_KEY, configToSave);

        return {
          success: true,
          error: '已保留现有配置文件',
        };
      }

      // Create backup before overwriting
      let backupInfo: BackupInfo | null = null;
      const settingsPath = this.getClaudeSettingsPath();

      try {
        await fs.access(settingsPath);
        backupInfo = await this.backupConfigFile();
      } catch {
        // File doesn't exist, no backup needed
      }

      // Prepare config with metadata
      const configToSave: ClaudeConfig = {
        ...config,
        validatedAt: new Date().toISOString(),
        lastValidationStatus: 'success',
      };

      // Save to electron-store
      this.store.set(ClaudeConfigManager.STORE_KEY, configToSave);

      // Generate settings.json with env format
      await this.generateSettingsFile(config);

      log.info('[ClaudeConfigManager] Configuration saved successfully');

      return {
        success: true,
        backupPath: backupInfo?.path,
      };
    } catch (error) {
      log.error('[ClaudeConfigManager] Failed to save configuration:', error);

      // Attempt rollback if we have a backup
      // (In a full implementation, we would restore from backup here)

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate Claude Code CLI settings.json file with env format
   */
  private async generateSettingsFile(config: ClaudeConfig): Promise<void> {
    try {
      const settingsPath = this.getClaudeSettingsPath();
      const claudeDir = path.dirname(settingsPath);

      // Ensure .claude directory exists
      await fs.mkdir(claudeDir, { recursive: true });

      // Build env format configuration
      const envConfig = this.buildEnvConfig(config);

      // Validate configuration before writing
      const validation = this.validateConfig(envConfig);
      if (!validation.valid) {
        throw new Error(`配置验证失败: ${validation.error}`);
      }

      // Write configuration file atomically
      await this.writeConfigFile(settingsPath, envConfig);

      log.info('[ClaudeConfigManager] Settings file generated at:', settingsPath);
    } catch (error) {
      log.error('[ClaudeConfigManager] Failed to generate settings file:', error);
      throw error;
    }
  }

  /**
   * Get stored Claude configuration
   */
  getStoredConfig(): ClaudeConfig | null {
    const stored = this.store.get(ClaudeConfigManager.STORE_KEY) as ClaudeConfig | undefined;
    return stored || null;
  }

  /**
   * Delete stored Claude configuration
   */
  deleteStoredConfig(): void {
    log.info('[ClaudeConfigManager] Deleting stored configuration');
    this.store.delete(ClaudeConfigManager.STORE_KEY);
  }

  /**
   * Test Claude configuration by opening terminal and running 'claude hi'
   * This opens a new terminal window to visually test the configuration
   */
  async testConfiguration(): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('[ClaudeConfigManager] Testing configuration with terminal...');

      // Determine the platform and appropriate command
      const platform = process.platform;
      let command: string | undefined;

      if (platform === 'win32') {
        // Windows: Open new CMD window and run claude hi
        command = 'start cmd /k "claude hi && pause && exit"';
      } else if (platform === 'darwin') {
        // macOS: Open new Terminal window and run claude hi
        command = 'osascript -e \'tell application "Terminal" to do script "claude hi; read -p \\"Press enter to exit...\\"; exit"\'';
      } else {
        // Linux: Open new terminal window and run claude hi
        // Try common terminal emulators
        const terminals = [
          'gnome-terminal', // GNOME
          'konsole',        // KDE
          'xfce4-terminal', // XFCE
          'xterm',          // Fallback
        ];

        // Use the first available terminal
        for (const term of terminals) {
          try {
            // Test if terminal is available
            await execAsync(`which ${term}`);
            command = `${term} -- bash -c "claude hi; read -p 'Press enter to exit...'; exit"`;
            break;
          } catch {
            continue;
          }
        }
      }

      if (!command) {
        return {
          success: false,
          error: '无法找到可用的终端模拟器',
        };
      }

      // Execute the command to open terminal
      await execAsync(command);

      log.info('[ClaudeConfigManager] Terminal opened successfully for testing');
      return { success: true };
    } catch (error) {
      log.error('[ClaudeConfigManager] Failed to open terminal for testing:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Backup the existing configuration file
   * Creates a timestamped backup before overwriting
   */
  async backupConfigFile(): Promise<BackupInfo | null> {
    try {
      const settingsPath = this.getClaudeSettingsPath();

      // Check if file exists
      try {
        await fs.access(settingsPath);
      } catch {
        log.info('[ClaudeConfigManager] No existing config to backup');
        return null;
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const backupFilename = `settings.json.backup.${timestamp}`;
      const backupPath = path.join(path.dirname(settingsPath), backupFilename);

      // Copy file to backup location
      await fs.copyFile(settingsPath, backupPath);

      // Get file stats
      const stats = await fs.stat(backupPath);

      log.info('[ClaudeConfigManager] Config backed up to:', backupPath);

      // Clean up old backups
      await this.cleanupOldBackups();

      return {
        path: backupPath,
        timestamp: new Date(),
        size: stats.size,
      };
    } catch (error) {
      log.error('[ClaudeConfigManager] Failed to backup config:', error);
      throw new Error('Failed to create configuration backup');
    }
  }

  /**
   * Clean up old backup files, retaining only the most recent ones
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const settingsDir = path.join(os.homedir(), ClaudeConfigManager.CLAUDE_DIR_NAME);
      const files = await fs.readdir(settingsDir);

      // Find all backup files
      const backupFiles = files
        .filter(f => f.startsWith('settings.json.backup.'))
        .map(f => ({
          name: f,
          path: path.join(settingsDir, f),
          // Extract timestamp from filename for sorting
          timestamp: f.replace('settings.json.backup.', ''),
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      // Remove oldest backups if we exceed retention limit
      if (backupFiles.length > ClaudeConfigManager.BACKUP_RETENTION_COUNT) {
        const toRemove = backupFiles.slice(ClaudeConfigManager.BACKUP_RETENTION_COUNT);

        for (const file of toRemove) {
          await fs.unlink(file.path);
          log.info('[ClaudeConfigManager] Removed old backup:', file.name);
        }
      }
    } catch (error) {
      log.warn('[ClaudeConfigManager] Failed to cleanup old backups:', error);
    }
  }

  /**
   * List all available backup files
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const settingsDir = path.join(os.homedir(), ClaudeConfigManager.CLAUDE_DIR_NAME);
      const files = await fs.readdir(settingsDir);

      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (file.startsWith('settings.json.backup.')) {
          const filePath = path.join(settingsDir, file);
          const stats = await fs.stat(filePath);

          // Parse timestamp from filename
          const timestampStr = file.replace('settings.json.backup.', '');
          const timestamp = new Date(
            `${timestampStr.slice(0, 4)}-${timestampStr.slice(4, 6)}-${timestampStr.slice(6, 8)}T${timestampStr.slice(9, 11)}:${timestampStr.slice(11, 13)}:${timestampStr.slice(13, 15)}Z`
          );

          backups.push({
            path: filePath,
            timestamp: isNaN(timestamp.getTime()) ? stats.mtime : timestamp,
            size: stats.size,
          });
        }
      }

      // Sort by timestamp, newest first
      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      log.error('[ClaudeConfigManager] Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Restore configuration from a backup file
   */
  async restoreFromBackup(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate backup file exists
      try {
        await fs.access(backupPath);
      } catch {
        return {
          success: false,
          error: '备份文件不存在',
        };
      }

      // Create backup of current config before restoring
      const currentBackup = await this.backupConfigFile();

      // Read and validate backup content
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      let parsedBackup: Record<string, unknown>;

      try {
        parsedBackup = JSON.parse(backupContent);
      } catch {
        return {
          success: false,
          error: '备份文件格式无效',
        };
      }

      // Validate it's a reasonable config file
      if (!parsedBackup.env && !parsedBackup.providers) {
        return {
          success: false,
          error: '备份文件不是有效的 Claude 配置',
        };
      }

      // Write backup content to settings.json
      const settingsPath = this.getClaudeSettingsPath();
      await fs.writeFile(settingsPath, JSON.stringify(parsedBackup, null, 2), 'utf-8');

      log.info('[ClaudeConfigManager] Configuration restored from:', backupPath);

      return { success: true };
    } catch (error) {
      log.error('[ClaudeConfigManager] Failed to restore from backup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Detect the source of an existing configuration
   */
  async detectConfigSource(): Promise<ConfigSource> {
    try {
      const settingsPath = this.getClaudeSettingsPath();

      // Check if file exists
      try {
        await fs.access(settingsPath);
      } catch {
        return ConfigSource.Unknown;
      }

      const content = await fs.readFile(settingsPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Check for metadata marker
      if (parsed._metadata?._generated_by === ClaudeConfigManager.METADATA_GENERATOR) {
        return ConfigSource.HagiCodeDesktop;
      }

      // Check if it has our env format (indicating app-generated)
      if (parsed.env && parsed.env.ANTHROPIC_AUTH_TOKEN) {
        // Has env format but no metadata - could be from another app version
        return ConfigSource.HagiCodeDesktop;
      }

      // Has providers format - legacy or manual config
      if (parsed.providers) {
        return ConfigSource.Manual;
      }

      // Unknown format
      return ConfigSource.Unknown;
    } catch (error) {
      log.warn('[ClaudeConfigManager] Failed to detect config source:', error);
      return ConfigSource.Unknown;
    }
  }

  /**
   * Check if existing configuration should be preserved
   */
  async shouldPreserveExistingConfig(): Promise<boolean> {
    const source = await this.detectConfigSource();

    // Preserve manual configurations
    if (source === ConfigSource.Manual) {
      log.info('[ClaudeConfigManager] Preserving existing manual configuration');
      return true;
    }

    // Overwrite app-generated configurations
    if (source === ConfigSource.HagiCodeDesktop) {
      log.info('[ClaudeConfigManager] Will overwrite app-generated configuration');
      return false;
    }

    // Unknown source - preserve to be safe
    log.info('[ClaudeConfigManager] Preserving unknown configuration');
    return true;
  }

  /**
   * Build env format configuration from ClaudeConfig
   */
  private buildEnvConfig(config: ClaudeConfig): ClaudeConfigEnvSettings {
    // Get model mapping for provider
    const modelMapping: ModelMapping = DEFAULT_MODEL_MAPPINGS[config.provider] || {};

    const envConfig: ClaudeConfigEnvSettings = {
      env: {
        ANTHROPIC_AUTH_TOKEN: config.apiKey,
        API_TIMEOUT_MS: ClaudeConfigManager.API_TIMEOUT_MS,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: ClaudeConfigManager.DISABLE_NONESSENTIAL_TRAFFIC,
      },
      _metadata: {
        _generated_by: ClaudeConfigManager.METADATA_GENERATOR,
        _generated_at: new Date().toISOString(),
      },
    };

    // Add endpoint if specified
    if (config.endpoint) {
      envConfig.env.ANTHROPIC_BASE_URL = config.endpoint;
    }

    // Add model mappings if available
    if (modelMapping.haiku) {
      envConfig.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelMapping.haiku;
    }
    if (modelMapping.sonnet) {
      envConfig.env.ANTHROPIC_DEFAULT_SONNET_MODEL = modelMapping.sonnet;
    }
    if (modelMapping.opus) {
      envConfig.env.ANTHROPIC_DEFAULT_OPUS_MODEL = modelMapping.opus;
    }

    return envConfig;
  }

  /**
   * Write configuration file atomically with validation
   */
  private async writeConfigFile(settingsPath: string, content: ClaudeConfigEnvSettings): Promise<void> {
    // Validate JSON structure
    const jsonString = JSON.stringify(content, null, 2);

    // Create temp file
    const tempPath = `${settingsPath}.tmp`;

    try {
      // Write to temp file
      await fs.writeFile(tempPath, jsonString, { mode: 0o600, encoding: 'utf-8' });

      // Verify file was written correctly
      const writtenContent = await fs.readFile(tempPath, 'utf-8');
      JSON.parse(writtenContent); // Validate JSON

      // Atomic rename
      await fs.rename(tempPath, settingsPath);

      log.info('[ClaudeConfigManager] Configuration file written successfully');
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore
      }
      throw error;
    }
  }

  /**
   * Validate the generated configuration
   */
  private validateConfig(config: ClaudeConfigEnvSettings): { valid: boolean; error?: string } {
    if (!config.env) {
      return { valid: false, error: '配置缺少 env 字段' };
    }

    if (!config.env.ANTHROPIC_AUTH_TOKEN) {
      return { valid: false, error: '配置缺少 ANTHROPIC_AUTH_TOKEN' };
    }

    // Validate URL format if present
    if (config.env.ANTHROPIC_BASE_URL) {
      try {
        new URL(config.env.ANTHROPIC_BASE_URL);
      } catch {
        return { valid: false, error: 'ANTHROPIC_BASE_URL 格式无效' };
      }
    }

    return { valid: true };
  }
}
