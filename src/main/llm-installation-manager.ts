import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log';
import { type DetectionResult, Region, RegionDetector } from './region-detector.js';
import { loadConsoleEnvironment } from './shell-env-loader.js';

const execAsync = promisify(exec);
const CLI_PRECHECK_TIMEOUT_MS = 8_000;

export type CliExecutionErrorCode =
  | 'CLI_NOT_FOUND'
  | 'AUTH_REQUIRED'
  | 'INVALID_ARGUMENT'
  | 'EXECUTION_FAILED';

interface CliPrecheckResult {
  success: boolean;
  resolvedCommand?: string;
  errorCode?: CliExecutionErrorCode;
  error?: string;
  exitCode?: number;
}

function resolveProviderId(commandName: string): string {
  if (commandName.includes('copilot')) {
    return 'copilot-cli';
  }
  if (commandName.includes('codex')) {
    return 'codex';
  }
  return 'claude-code';
}

function getCommandCandidates(commandName: string): string[] {
  if (commandName === 'copilot') {
    return ['copilot', 'github-copilot-cli'];
  }
  return [commandName];
}

function quoteShellArg(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function buildCliLaunchInvocation(commandName: string, promptText: string): { args: string[]; shellCommand: string } {
  if (commandName === 'copilot') {
    const args = ['-i', promptText];
    return {
      args,
      shellCommand: `${commandName} -i ${quoteShellArg(promptText)}`,
    };
  }

  const args = [promptText];
  return {
    args,
    shellCommand: `${commandName} ${quoteShellArg(promptText)}`,
  };
}

export function includesInvalidArgumentHint(content: string): boolean {
  const normalized = content.toLowerCase();
  return normalized.includes('unknown option')
    || normalized.includes('invalid option')
    || normalized.includes('invalid argument')
    || normalized.includes('unexpected argument');
}

export function includesAuthRequiredHint(content: string): boolean {
  const normalized = content.toLowerCase();
  return normalized.includes('not logged in')
    || normalized.includes('authentication required')
    || normalized.includes('sign in')
    || normalized.includes('login required')
    || normalized.includes('authenticate first');
}

/**
 * LLM prompt configuration
 */
export interface LlmPromptConfig {
  version: string;
  content: string;
  region: Region;
  filePath: string; // Added file path
  detection: DetectionResult;
}

/**
 * API call result
 */
export interface ApiCallResult {
  success: boolean;
  error?: string;
  errorCode?: CliExecutionErrorCode;
  providerId?: string;
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

  private resolvePromptDetection(overrideRegion?: 'cn' | 'international'): DetectionResult {
    if (overrideRegion) {
      return {
        region: overrideRegion === 'cn' ? 'CN' : 'INTERNATIONAL',
        detectedAt: new Date(),
        method: 'override',
        localeSnapshot: null,
        rawLocale: null,
        matchedRule: 'manual-override',
      };
    }

    return this.regionDetector.detectWithCache();
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

      // Explicit onboarding region selection must win over locale detection.
      const detection = this.resolvePromptDetection(overrideRegion);
      const region = detection.region;
      log.info('[LlmInstallationManager] Using region:', {
        region,
        overrideRegion: overrideRegion ?? null,
        detectionMethod: detection.method,
        localeSnapshot: detection.localeSnapshot,
        rawLocale: detection.rawLocale,
        matchedRule: detection.matchedRule,
      });

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
        detection,
      };
    } catch (error) {
      log.error('[LlmInstallationManager] Failed to load prompt:', error);
      throw error;
    }
  }

  /**
   * Call AI CLI with the given prompt file path using the specified CLI command
   * Opens a visible terminal window to execute the prompt (similar to testConfiguration)
   * Instead of passing the entire prompt content, we pass a short command that tells the AI to read the file
   * @param promptFilePath Path to the prompt file
   * @param mainWindow The main window instance
   * @param commandName The CLI command to use ('claude' | 'codex' | 'copilot')
   */
  async callApi(promptFilePath: string, mainWindow: any, commandName: string = 'claude'): Promise<ApiCallResult> {
    const providerId = resolveProviderId(commandName);
    try {
      log.info(`[LlmInstallationManager] Opening terminal with ${commandName} CLI...`);
      log.info('[LlmInstallationManager] Prompt file path:', promptFilePath);
      log.info('[LlmInstallationManager] Debug mode:', this.debugMode);

      const runtimeEnv = await this.buildCliRuntimeEnv();
      this.logCliExecution(providerId, 'preflight_start', { commandName });
      const precheckResult = await this.precheckCli(commandName, runtimeEnv);
      if (!precheckResult.success) {
        this.logCliExecution(providerId, 'preflight_failed', {
          errorCode: precheckResult.errorCode,
          reason: precheckResult.error,
          exitCode: precheckResult.exitCode ?? null,
        });
        return {
          success: false,
          errorCode: precheckResult.errorCode,
          error: precheckResult.error,
          providerId,
        };
      }

      const resolvedCommand = precheckResult.resolvedCommand || commandName;
      this.logCliExecution(providerId, 'preflight_ok', { resolvedCommand });

      // Determine the platform and appropriate command
      const platform = process.platform;
      log.info('[LlmInstallationManager] Platform:', platform);

      let terminalFound = false;
      let constructedCommand = '';
      // Get just the filename, not the full path
      const fileName = path.basename(promptFilePath);
      // Set working directory to the directory containing the prompt file
      const promptDir = path.dirname(promptFilePath);
      const promptText = `Follow ${fileName} to install hagicode desktop and follow the instructions in it.`;
      const invocation = buildCliLaunchInvocation(commandName, promptText);
      const resolvedShellCommand = commandName === resolvedCommand
        ? invocation.shellCommand
        : `${resolvedCommand}${invocation.shellCommand.slice(commandName.length)}`;

      if (platform === 'win32') {
        // Windows: Directly spawn CLI process
        try {
          log.info('[LlmInstallationManager] Windows command:', `${resolvedCommand} ${invocation.args.join(' ')}`);
          spawn(resolvedCommand, invocation.args, {
            detached: true,
            stdio: 'ignore',
            cwd: promptDir,
            env: runtimeEnv,
            shell: true,
          }).unref();
          terminalFound = true;
          log.info('[LlmInstallationManager] Spawned Windows terminal successfully');
        } catch (err) {
          log.error('[LlmInstallationManager] Failed to spawn Windows terminal:', err);
        }
      } else if (platform === 'darwin') {
        // macOS: Open new Terminal window and run CLI with prompt
        try {
          const escapedPrompt = resolvedShellCommand.replace(/"/g, '\\"').replace(/\$/g, '\\$');
          constructedCommand = `osascript -e 'tell application "Terminal" to do script "${escapedPrompt}; read -p \\"Press enter to exit...\\"; exit"'`;
          log.info('[LlmInstallationManager] macOS command:', constructedCommand);
          await execAsync(constructedCommand, {
            cwd: promptDir,
            env: runtimeEnv,
          });
          terminalFound = true;
          log.info('[LlmInstallationManager] Opened macOS terminal successfully');
        } catch (err) {
          log.error('[LlmInstallationManager] Failed to open macOS terminal:', err);
        }
      } else {
        // Linux: Execute CLI via terminal emulator
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
            await execAsync(`which ${term}`, { env: runtimeEnv });
            log.info(`[LlmInstallationManager] Using terminal: ${term}`);

            const command = resolvedShellCommand;
            log.info('[LlmInstallationManager] Executing:', command);

            spawn(term, ['-e', command], {
              detached: true,
              stdio: 'ignore',
              cwd: promptDir,
              env: runtimeEnv,
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
          errorCode: 'EXECUTION_FAILED',
          error: '无法找到可用的终端模拟器',
          providerId,
        };
      }

      this.logCliExecution(providerId, 'launch_success', {
        commandName,
        resolvedCommand,
      });
      log.info('[LlmInstallationManager] Command execution result: Success - Terminal opened successfully for LLM installation');

      // Return success immediately after opening terminal
      // User will see the installation progress in the terminal window
      return {
        success: true,
        messageId: 'LLM installation initiated in terminal window',
        providerId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode: CliExecutionErrorCode = includesInvalidArgumentHint(errorMessage)
        ? 'INVALID_ARGUMENT'
        : 'EXECUTION_FAILED';
      log.error('[LlmInstallationManager] Command execution result: Failed -', errorMessage);
      log.error(`[LlmInstallationManager] Failed to open terminal for ${commandName} CLI:`, errorMessage);
      this.logCliExecution(providerId, 'launch_failed', {
        commandName,
        errorCode,
        reason: errorMessage,
      });
      return {
        success: false,
        errorCode,
        error: `Failed to execute ${commandName} CLI: ${errorMessage}. Make sure ${commandName} CLI is installed.`,
        providerId,
      };
    }
  }

  /**
   * Deprecated: Use callApi instead for better clarity
   * @deprecated Use callApi with explicit commandName parameter
   */
  async callClaudeAPI(promptFilePath: string, mainWindow: any): Promise<ApiCallResult> {
    return this.callApi(promptFilePath, mainWindow, 'claude');
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
    return this.regionDetector.detectWithCache().region;
  }

  getRegionStatus(): DetectionResult {
    return this.regionDetector.detectWithCache();
  }

  /**
   * Open AI CLI and load the specified prompt file
   * @param promptPath - Absolute path to the prompt file
   * @param commandName - The CLI command to use ('claude' or 'codex'). Defaults to 'claude'.
   * @returns Promise<void>
   */
  async openAICliWithPrompt(promptPath: string, commandName: string = 'claude'): Promise<void> {
    log.info('[LlmInstallationManager] openAICliWithPrompt called with path:', promptPath, 'command:', commandName);

    // Validate prompt file exists
    try {
      await fs.access(promptPath);
    } catch {
      log.error('[LlmInstallationManager] Prompt file does not exist:', promptPath);
      throw new Error(`Prompt file not found: ${promptPath}`);
    }

    log.info('[LlmInstallationManager] Prompt file validated, launching CLI...');

    // Use the existing callApi logic but simplified
    const result = await this.callApi(promptPath, null, commandName);

    if (!result.success) {
      const errorPrefix = result.errorCode ? `[${result.errorCode}] ` : '';
      throw new Error(`${errorPrefix}${result.error || 'Failed to open AI CLI'}`);
    }

    log.info('[LlmInstallationManager] AI CLI launched successfully');
  }

  private async precheckCli(commandName: string, runtimeEnv: NodeJS.ProcessEnv): Promise<CliPrecheckResult> {
    const commandCandidates = getCommandCandidates(commandName);

    let resolvedCommand: string | null = null;
    for (const candidate of commandCandidates) {
      const lookupCommand = process.platform === 'win32' ? 'where' : 'command -v';
      try {
        const { stdout } = await execAsync(`${lookupCommand} ${candidate}`, {
          env: runtimeEnv,
          windowsHide: true,
        });
        const firstLine = stdout
          .split(/\r?\n/)
          .map(line => line.trim())
          .find(line => line.length > 0);
        if (firstLine) {
          resolvedCommand = firstLine;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!resolvedCommand) {
      return {
        success: false,
        errorCode: 'CLI_NOT_FOUND',
        error: `CLI command not found: ${commandCandidates.join(', ')}`,
      };
    }

    const shouldCheckAuth = commandName === 'copilot';
    if (!shouldCheckAuth) {
      return { success: true, resolvedCommand };
    }

    const authProbe = await this.probeCommand(resolvedCommand, ['auth', 'status'], runtimeEnv, CLI_PRECHECK_TIMEOUT_MS);
    const combinedOutput = `${authProbe.stdout}\n${authProbe.stderr}`.trim();
    if (authProbe.exitCode !== 0) {
      if (includesInvalidArgumentHint(combinedOutput)) {
        // Some Copilot CLI versions don't expose `auth status`; fall back to runtime validation.
        return { success: true, resolvedCommand };
      }

      if (includesAuthRequiredHint(combinedOutput)) {
        return {
          success: false,
          errorCode: 'AUTH_REQUIRED',
          error: 'Copilot CLI authentication required. Please login first.',
          exitCode: authProbe.exitCode,
        };
      }

      if (includesInvalidArgumentHint(combinedOutput)) {
        return {
          success: false,
          errorCode: 'INVALID_ARGUMENT',
          error: `Copilot CLI precheck failed: ${combinedOutput || 'invalid arguments'}`,
          exitCode: authProbe.exitCode,
        };
      }
    }

    return { success: true, resolvedCommand };
  }

  private async probeCommand(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        env,
        shell: true,
        windowsHide: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        resolve({
          exitCode: 124,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: `${Buffer.concat(stderrChunks).toString('utf-8')}\nprobe timeout`,
        });
      }, timeoutMs);

      child.stdout?.on('data', chunk => stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
      child.stderr?.on('data', chunk => stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({
          exitCode: 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: `${Buffer.concat(stderrChunks).toString('utf-8')}\n${error.message}`,
        });
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        });
      });
    });
  }

  private logCliExecution(
    providerId: string,
    phase: string,
    details: Record<string, unknown> = {}
  ): void {
    log.info('[LlmInstallationManager][CliExecution]', {
      provider: providerId,
      phase,
      ...details,
    });
  }

  private async buildCliRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
    const consoleEnv = await loadConsoleEnvironment();
    const runtimeEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...consoleEnv,
    };

    if (Object.keys(consoleEnv).length > 0) {
      log.info('[LlmInstallationManager] Console environment merged for AI CLI:', {
        envCount: Object.keys(consoleEnv).length,
        source: process.platform === 'win32' ? 'powershell-profile' : 'shell-startup-files',
      });
    }

    return runtimeEnv;
  }
}
