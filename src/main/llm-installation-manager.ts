import fs from 'node:fs/promises';
import path from 'node:path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log';
import { Region, RegionDetector } from './region-detector.js';
import type { ClaudeConfigManager } from './claude-config-manager.js';
import type { DetectedConfig } from '../types/claude-config.js';

const execAsync = promisify(exec);

/**
 * LLM prompt configuration
 */
export interface LlmPromptConfig {
  version: string;
  content: string;
  region: Region;
  filePath: string; // Added file path
}

/**
 * API call result
 */
export interface ApiCallResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * LlmInstallationManager handles LLM prompt loading and Claude API calls
 * for the progressive installation wizard.
 *
 * Delegates to Claude CLI instead of managing API keys directly.
 */
export class LlmInstallationManager {
  private regionDetector: RegionDetector;
  private claudeConfigManager: ClaudeConfigManager;

  constructor(regionDetector: RegionDetector, claudeConfigManager: ClaudeConfigManager) {
    this.regionDetector = regionDetector;
    this.claudeConfigManager = claudeConfigManager;
  }

  /**
   * Load LLM prompt based on region from manifest
   * @param manifestPath Path to the manifest file
   * @param overrideRegion Optional region override ('cn' or 'international'). If not provided, uses auto-detected region.
   */
  async loadPrompt(manifestPath: string, overrideRegion?: 'cn' | 'international'): Promise<LlmPromptConfig> {
    try {
      log.info('[LlmInstallationManager] Loading LLM prompt from manifest:', manifestPath);
      if (overrideRegion) {
        log.info('[LlmInstallationManager] Region override provided:', overrideRegion);
      }

      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      // Use override region if provided, otherwise detect automatically
      const region = overrideRegion
        ? (overrideRegion === 'cn' ? 'CN' : 'INTERNATIONAL')
        : this.regionDetector.detectRegion();
      log.info('[LlmInstallationManager] Using region:', region);

      let promptPath: string;
      if (region === 'CN') {
        promptPath = manifest.entryPoint?.llmPrompt;
      } else {
        promptPath = manifest.entryPoint?.llmPromptIntl;
      }

      if (!promptPath) {
        throw new Error('LLM prompt path not found in manifest');
      }

      // Resolve the prompt file path relative to manifest directory
      const manifestDir = path.dirname(manifestPath);
      const resolvedPromptPath = path.resolve(manifestDir, promptPath);

      log.info('[LlmInstallationManager] Loading prompt from:', resolvedPromptPath);

      const promptContent = await fs.readFile(resolvedPromptPath, 'utf-8');
      const version = manifest.package?.version || 'unknown';

      return {
        version,
        content: promptContent,
        region,
        filePath: resolvedPromptPath, // Include the file path
      };
    } catch (error) {
      log.error('[LlmInstallationManager] Failed to load prompt:', error);
      throw error;
    }
  }

  /**
   * Detect existing Claude CLI configuration
   * Delegates to ClaudeConfigManager
   */
  async detectClaudeConfig(): Promise<DetectedConfig> {
    try {
      log.info('[LlmInstallationManager] Detecting Claude configuration...');
      return await this.claudeConfigManager.detectExistingConfig();
    } catch (error) {
      log.error('[LlmInstallationManager] Failed to detect Claude config:', error);
      return {
        exists: false,
        source: 'none',
      };
    }
  }

  /**
   * Call Claude API with the given prompt file path using Claude CLI
   * Opens a visible terminal window to execute the prompt (similar to testConfiguration)
   * Instead of passing the entire prompt content, we pass a short command that tells Claude to read the file
   */
  async callClaudeAPI(promptFilePath: string, mainWindow: any): Promise<ApiCallResult> {
    try {
      // First, verify that Claude configuration exists
      const config = await this.detectClaudeConfig();
      if (!config.exists) {
        throw new Error('Claude CLI is not configured. Please configure Claude first.');
      }

      log.info('[LlmInstallationManager] Opening terminal with Claude CLI...');
      log.info('[LlmInstallationManager] Prompt file path:', promptFilePath);

      // Construct a simple prompt that tells Claude to read and execute the prompt file
      // This avoids command line length limits and escaping issues
      const prompt = `Read the file at ${promptFilePath} and follow the instructions in it to help with installation.`;

      // Determine the platform and appropriate command
      const platform = process.platform;
      log.info('[LlmInstallationManager] Platform:', platform);

      let terminalFound = false;

      if (platform === 'win32') {
        // Windows: Open new CMD window and run claude with prompt
        try {
          spawn('cmd', ['/c', 'start', 'cmd', '/k', `claude "${prompt}" && pause && exit`], {
            detached: true,
            stdio: 'ignore',
          }).unref();
          terminalFound = true;
          log.info('[LlmInstallationManager] Spawned Windows terminal');
        } catch (err) {
          log.error('[LlmInstallationManager] Failed to spawn Windows terminal:', err);
        }
      } else if (platform === 'darwin') {
        // macOS: Open new Terminal window and run claude with prompt
        try {
          const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
          const cmd = `osascript -e 'tell application "Terminal" to do script "claude \\"${escapedPrompt}\\"; read -p \\"Press enter to exit...\\"; exit"'`;
          await execAsync(cmd);
          terminalFound = true;
          log.info('[LlmInstallationManager] Opened macOS terminal');
        } catch (err) {
          log.error('[LlmInstallationManager] Failed to open macOS terminal:', err);
        }
      } else {
        // Linux: Open new terminal window and run claude with prompt
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
            log.info(`[LlmInstallationManager] Using terminal: ${term}`);

            // Escape the prompt for bash
            const escapedPrompt = prompt.replace(/'/g, "'\\''");
            const cmd = `${term} -- bash -c "claude '${escapedPrompt}'; read -p 'Press enter to exit...'; exit"`;

            log.info('[LlmInstallationManager] Executing:', cmd);
            await execAsync(cmd);
            terminalFound = true;
            log.info('[LlmInstallationManager] Opened Linux terminal successfully');
            break;
          } catch (err) {
            log.warn(`[LlmInstallationManager] Failed to open ${term}:`, err);
            continue;
          }
        }
      }

      if (!terminalFound) {
        return {
          success: false,
          error: '无法找到可用的终端模拟器',
        };
      }

      log.info('[LlmInstallationManager] Terminal opened successfully for LLM installation');

      // Return success immediately after opening terminal
      // User will see the installation progress in the terminal window
      return {
        success: true,
        messageId: 'LLM installation initiated in terminal window',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('[LlmInstallationManager] Failed to open terminal for Claude API:', errorMessage);
      return {
        success: false,
        error: `Failed to execute Claude CLI: ${errorMessage}. Make sure Claude Code CLI is installed.`,
      };
    }
  }

  /**
   * Get current region
   */
  getRegion(): Region {
    return this.regionDetector.detectRegion();
  }
}
