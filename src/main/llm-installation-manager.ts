import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log';
import { Region, RegionDetector } from './region-detector.js';

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
 * for progressive installation wizard.
 *
 * Delegates to Claude CLI instead of managing API keys directly.
 */
export class LlmInstallationManager {
  private regionDetector: RegionDetector;
  // Debug mode flag - can be extended to read from electron-store in future
  private debugMode: boolean = false;

  constructor(regionDetector: RegionDetector, debugMode: boolean = false) {
    this.regionDetector = regionDetector;
    this.debugMode = debugMode;
  }

  /**
   * Load LLM prompt based on region from manifest
   * @param manifestPath Path to manifest file
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

      // Resolve the prompt file path relative to the manifest directory
      const manifestDir = path.dirname(manifestPath);
      const resolvedPromptPath = path.resolve(manifestDir, promptPath);

      log.info('[LlmInstallationManager] Loading prompt from:', resolvedPromptPath);

      const promptContent = await fs.readFile(resolvedPromptPath, 'utf-8');
      const version = manifest.package?.version || 'unknown';

      // Log prompt details for debugging
      this.logPromptDetails(resolvedPromptPath, promptContent);

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
   * Call Claude API with the given prompt file path using Claude CLI
   * Opens a visible terminal window to execute the prompt (similar to testConfiguration)
   * Instead of passing the entire prompt content, we pass a short command that tells Claude to read the file
   */
  async callClaudeAPI(promptFilePath: string, mainWindow: any): Promise<ApiCallResult> {
    try {
      log.info('[LlmInstallationManager] Opening terminal with Claude CLI...');
      log.info('[LlmInstallationManager] Prompt file path:', promptFilePath);
      log.info('[LlmInstallationManager] Debug mode:', this.debugMode);

      // Determine the platform and appropriate command
      const platform = process.platform;
      log.info('[LlmInstallationManager] Platform:', platform);

      let terminalFound = false;
      let constructedCommand = '';
      // Get just the filename, not the full path
      const fileName = path.basename(promptFilePath);
      // Set working directory to the directory containing the prompt file
      const promptDir = path.dirname(promptFilePath);
      // Construct command with file name and instruction
      const prompt = `"Follow ${fileName} to install hagicode desktop and follow the instructions in it."`;

      if (platform === 'win32') {
        // Windows: Directly spawn claude process
        try {
          log.info('[LlmInstallationManager] Windows command:', `claude "${prompt}"`);
          spawn('claude', [prompt], {
            detached: true,
            stdio: 'ignore',
            cwd: promptDir,
            shell: true,
          }).unref();
          terminalFound = true;
          log.info('[LlmInstallationManager] Spawned Windows terminal successfully');
        } catch (err) {
          log.error('[LlmInstallationManager] Failed to spawn Windows terminal:', err);
        }
      } else if (platform === 'darwin') {
        // macOS: Open new Terminal window and run claude with prompt
        try {
          const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
          constructedCommand = `osascript -e 'tell application "Terminal" to do script "claude \\"${escapedPrompt}\\"; read -p \\"Press enter to exit...\\"; exit"'`;
          log.info('[LlmInstallationManager] macOS command:', constructedCommand);
          await execAsync(constructedCommand);
          terminalFound = true;
          log.info('[LlmInstallationManager] Opened macOS terminal successfully');
        } catch (err) {
          log.error('[LlmInstallationManager] Failed to open macOS terminal:', err);
        }
      } else {
        // Linux: Execute claude via terminal emulator
        // Detect desktop environment and prioritize appropriate terminal
        const desktopSession = process.env.DESKTOP_SESSION || process.env.XDG_CURRENT_DESKTOP || '';

        // Common terminal emulators ordered by priority
        const terminals = [
          'gnome-terminal', // GNOME
          'konsole',        // KDE
          'xfce4-terminal', // XFCE
          'xterm',          // Fallback
        ];

        // Reorder terminals based on desktop environment
        let prioritizedTerminals = [...terminals];
        if (desktopSession.toLowerCase().includes('kde') || desktopSession.toLowerCase().includes('plasma')) {
          prioritizedTerminals = ['konsole', 'gnome-terminal', 'xfce4-terminal', 'xterm'];
        } else if (desktopSession.toLowerCase().includes('gnome')) {
          prioritizedTerminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
        } else if (desktopSession.toLowerCase().includes('xfce')) {
          prioritizedTerminals = ['xfce4-terminal', 'gnome-terminal', 'konsole', 'xterm'];
        }

        log.info(`[LlmInstallationManager] Terminal priority order: ${prioritizedTerminals.join(', ')}`);

        // Use first available terminal
        for (const term of prioritizedTerminals) {
          try {
            // Test if the terminal is available
            await execAsync(`which ${term}`);
            log.info(`[LlmInstallationManager] Using terminal: ${term}`);

            const command = `claude ${prompt}`;
            log.info('[LlmInstallationManager] Executing:', command);

            spawn(term, ['-e', command], {
              detached: true,
              stdio: 'ignore',
              cwd: promptDir,
              env: { ...process.env, PATH: process.env.PATH },
            }).unref();
            terminalFound = true;
            log.info('[LlmInstallationManager] Opened Linux terminal successfully');
            break;
          } catch (err) {
            log.warn(`[LlmInstallationManager] Failed to open ${term}:`, err);
            continue;
          }
        }
      }

      // Save debug state if debug mode is enabled
      if (this.debugMode && constructedCommand) {
        try {
          const debugFile = await this.saveDebugState(promptFilePath, constructedCommand);
          log.info('[LlmInstallationManager] Debug file created at:', debugFile);
        } catch (err) {
          log.error('[LlmInstallationManager] Failed to save debug state:', err);
        }
      }

      if (!terminalFound) {
        log.error('[LlmInstallationManager] Command execution result: Failed - No terminal emulator found');
        return {
          success: false,
          error: '无法找到可用的终端模拟器',
        };
      }

      log.info('[LlmInstallationManager] Command execution result: Success - Terminal opened successfully for LLM installation');

      // Return success immediately after opening terminal
      // User will see the installation progress in the terminal window
      return {
        success: true,
        messageId: 'LLM installation initiated in terminal window',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('[LlmInstallationManager] Command execution result: Failed -', errorMessage);
      log.error('[LlmInstallationManager] Failed to open terminal for Claude API:', errorMessage);
      return {
        success: false,
        error: `Failed to execute Claude CLI: ${errorMessage}. Make sure Claude Code CLI is installed.`,
      };
    }
  }

  /**
   * Log prompt details for debugging
   * @param promptFilePath Path to the prompt file
   * @param content Prompt content
   */
  private logPromptDetails(promptFilePath: string, content: string): void {
    log.info('[LlmInstallationManager] Prompt file path:', promptFilePath);
    log.info('[LlmInstallationManager] Prompt content length:', content.length);
    log.info('[LlmInstallationManager] Prompt content preview:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
  }

  /**
   * Save debug state to a temporary file
   * @param promptFilePath Path to the prompt file
   * @param command Command that was constructed
   * @returns Path to the debug file
   */
  private async saveDebugState(promptFilePath: string, command: string): Promise<string> {
    const debugDir = path.join(os.tmpdir(), 'hagicode-debug');
    await fs.mkdir(debugDir, { recursive: true });
    const debugFile = path.join(debugDir, `prompt-debug-${Date.now()}.json`);
    await fs.writeFile(debugFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      promptFilePath,
      command,
      platform: process.platform,
    }, null, 2));
    return debugFile;
  }

  /**
   * Get current region
   */
  getRegion(): Region {
    return this.regionDetector.detectRegion();
  }
}
