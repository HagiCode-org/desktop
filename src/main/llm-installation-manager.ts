import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'child_process';
import log from 'electron-log';
import { executeCli } from './utils/cli-executor.js';
import { type DetectionResult, Region, RegionDetector } from './region-detector.js';
import { loadConsoleEnvironment } from './shell-env-loader.js';
import { findManagedNpmPackage } from '../shared/npm-managed-packages.js';
import type { PromptGuidanceSource } from '../types/prompt-guidance.js';
import type { Dependency, DependencyVersionWithRuntime, Manifest } from './manifest-reader.js';

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
  filePath: string;
  source: Extract<PromptGuidanceSource, 'manifest-entry' | 'generated-from-manifest'>;
  detection: DetectionResult;
}

type DesktopPlatform = 'linux' | 'macos' | 'windows';

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

  constructor(regionDetector: RegionDetector) {
    this.regionDetector = regionDetector;
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
      const manifest = JSON.parse(manifestContent) as Manifest;

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

      let promptPath: string | undefined;
      if (region === 'CN') {
        promptPath = manifest.entryPoint?.llmPrompt;
      } else {
        promptPath = manifest.entryPoint?.llmPromptIntl;
      }

      const version = manifest.package?.version || 'unknown';
      const manifestDir = path.dirname(manifestPath);

      if (promptPath) {
        const resolvedPromptPath = path.resolve(manifestDir, promptPath);
        log.info('[LlmInstallationManager] Loading packaged prompt from:', resolvedPromptPath);

        try {
          const promptContent = await fs.readFile(resolvedPromptPath, 'utf-8');
          this.logPromptDetails(resolvedPromptPath, promptContent);

          return {
            version,
            content: promptContent,
            region,
            filePath: resolvedPromptPath,
            source: 'manifest-entry',
            detection,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          log.warn('[LlmInstallationManager] Packaged prompt could not be read, falling back to generated prompt:', {
            resolvedPromptPath,
            error: errorMessage,
          });
        }
      }

      const promptContent = this.buildGeneratedPrompt(manifest, region);
      const generatedPromptPath = await this.materializeGeneratedPrompt(manifestPath, version, region, promptContent);
      this.logPromptDetails(generatedPromptPath, promptContent);

      return {
        version,
        content: promptContent,
        region,
        filePath: generatedPromptPath,
        source: 'generated-from-manifest',
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
          const appleScript = `tell application "Terminal" to do script "${escapedPrompt}; read -p \\"Press enter to exit...\\"; exit"`;
          log.info('[LlmInstallationManager] macOS command:', appleScript);
          const openTerminalResult = await executeCli({
            command: 'osascript',
            args: ['-e', appleScript],
            cwd: promptDir,
            env: runtimeEnv,
            windowsHide: true,
            metadata: { component: 'LlmInstallationManager', phase: 'macos_terminal_launch' },
          });
          terminalFound = openTerminalResult.success;
          if (terminalFound) {
            log.info('[LlmInstallationManager] Opened macOS terminal successfully');
          } else {
            log.error('[LlmInstallationManager] macOS terminal launch failed:', openTerminalResult.error?.message || openTerminalResult.stderr);
          }
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
            const terminalProbe = await executeCli({
              command: 'which',
              args: [term],
              env: runtimeEnv,
              windowsHide: true,
              metadata: { component: 'LlmInstallationManager', phase: 'linux_terminal_probe', terminal: term },
            });
            if (!terminalProbe.success) {
              throw new Error(terminalProbe.error?.message || `Terminal not found: ${term}`);
            }
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

  private buildGeneratedPrompt(manifest: Manifest, region: Region): string {
    const version = manifest.package?.version || 'unknown';
    const platform = this.getCurrentDesktopPlatform();
    const dependencies = Object.entries(manifest.dependencies ?? {});
    const dependencySection = dependencies.length > 0
      ? dependencies
          .map(([name, dependency]) => this.formatDependencyBlock(name, dependency, region))
          .join('\n\n')
      : (region === 'CN'
          ? '- manifest 中没有可执行的依赖清单，请先确认发行包是否完整。\n- 不要猜测缺失的依赖项名称或安装命令。'
          : '- The manifest does not include actionable dependency entries.\n- Do not guess missing dependency names or install commands.');

    const platformLine = region === 'CN'
      ? `当前桌面端运行平台：${platform}。请只执行适用于该平台的命令。`
      : `Current desktop platform: ${platform}. Only execute commands that match this platform.`;

    if (region === 'CN') {
      return [
        '你正在协助安装 HagiCode Desktop 的版本依赖。',
        `目标版本：${version}`,
        platformLine,
        '请先阅读下面的依赖清单，再按顺序完成这些事情：',
        '1. 逐项检查依赖是否已经存在，并给出你实际执行的检查命令与结果。',
        '2. 如果某项缺失，只使用 manifest 已给出的安装提示或 Desktop 已知的包信息生成安装命令。',
        '3. 如果 manifest 没有提供足够信息，不要猜测包名；明确指出缺失信息并停止该项安装。',
        '4. 完成后输出最终状态摘要，标记已满足、已安装、仍阻塞的依赖。',
        '',
        '依赖清单：',
        dependencySection,
      ].join('\n');
    }

    return [
      'You are helping install runtime dependencies for a HagiCode Desktop package.',
      `Target version: ${version}`,
      platformLine,
      'Work through the manifest-driven dependency list in order:',
      '1. Check each dependency first and show the command you used plus the observed result.',
      '2. If a dependency is missing, only use install hints or Desktop-managed package metadata that are explicitly available.',
      '3. If the manifest does not provide enough information, do not guess package names; call out the missing data and stop that install step.',
      '4. Finish with a status summary that separates satisfied, installed, and still-blocked dependencies.',
      '',
      'Dependency list:',
      dependencySection,
    ].join('\n');
  }

  private formatDependencyBlock(name: string, dependency: Dependency, region: Region): string {
    const bullet = region === 'CN' ? '-' : '-';
    const versionLines = this.formatVersionLines(dependency.version, region);
    const installCommand = this.resolveInstallCommand(name, dependency, region);
    const installHintLabel = region === 'CN' ? '安装提示' : 'Install hint';
    const descriptionLabel = region === 'CN' ? '描述' : 'Description';
    const checkLabel = region === 'CN' ? '检查命令' : 'Check command';
    const installCommandLabel = region === 'CN' ? '建议安装命令' : 'Suggested install command';
    const lines = [
      `### ${name}`,
      `${bullet} ${descriptionLabel}: ${dependency.description || name}`,
    ];

    if ('checkCommand' in dependency && typeof dependency.checkCommand === 'string' && dependency.checkCommand.trim()) {
      lines.push(`${bullet} ${checkLabel}: ${dependency.checkCommand}`);
    } else {
      const fallbackCheckCommand = this.getFallbackCheckCommand(name);
      if (fallbackCheckCommand) {
        lines.push(`${bullet} ${checkLabel}: ${fallbackCheckCommand}`);
      }
    }

    lines.push(...versionLines.map((line) => `${bullet} ${line}`));

    if (installCommand) {
      lines.push(`${bullet} ${installCommandLabel}: ${installCommand}`);
    } else if (dependency.installHint?.trim()) {
      lines.push(`${bullet} ${installHintLabel}: ${dependency.installHint.trim()}`);
    }

    if (dependency.type === 'system-requirement') {
      lines.push(region === 'CN'
        ? `${bullet} 仅做环境核对，不要编造自动安装命令。`
        : `${bullet} Treat this as an environment check only. Do not invent an automatic install command.`);
    }

    return lines.join('\n');
  }

  private formatVersionLines(version: Dependency['version'], region: Region): string[] {
    const lines: string[] = [];
    const versionInfo = version as DependencyVersionWithRuntime;
    const source = versionInfo.runtime ?? versionInfo;
    const minLabel = region === 'CN' ? '最低版本' : 'Minimum version';
    const maxLabel = region === 'CN' ? '最高版本' : 'Maximum version';
    const recommendedLabel = region === 'CN' ? '推荐版本' : 'Recommended version';
    const exactLabel = region === 'CN' ? '固定版本' : 'Exact version';

    if (source.min) {
      lines.push(`${minLabel}: ${source.min}`);
    }
    if (source.max) {
      lines.push(`${maxLabel}: ${source.max}`);
    }
    if (source.recommended) {
      lines.push(`${recommendedLabel}: ${source.recommended}`);
    }
    if ('exact' in source && source.exact) {
      lines.push(`${exactLabel}: ${source.exact}`);
    }

    return lines;
  }

  private resolveInstallCommand(name: string, dependency: Dependency, region: Region): string | null {
    if (dependency.type !== 'npm') {
      return null;
    }

    const managedPackage = findManagedNpmPackage(name);
    if (managedPackage?.installSpec) {
      return `npm install -g ${managedPackage.installSpec}`;
    }

    if (dependency.installHint?.trim()) {
      return dependency.installHint.trim();
    }

    return region === 'CN'
      ? 'manifest 未提供可执行的 npm 包名，请不要猜测。'
      : 'The manifest does not provide an actionable npm package name. Do not guess.';
  }

  private getFallbackCheckCommand(name: string): string | null {
    const managedPackage = findManagedNpmPackage(name);
    if (managedPackage?.binName) {
      return `${managedPackage.binName} --version`;
    }

    if (name === 'node') {
      return 'node --version';
    }

    return null;
  }

  private getCurrentDesktopPlatform(): DesktopPlatform {
    switch (process.platform) {
      case 'darwin':
        return 'macos';
      case 'win32':
        return 'windows';
      default:
        return 'linux';
    }
  }

  private async materializeGeneratedPrompt(
    manifestPath: string,
    version: string,
    region: Region,
    promptContent: string,
  ): Promise<string> {
    const cacheRoot = path.join(os.tmpdir(), 'hagicode-desktop-generated-prompts');
    const manifestHash = crypto.createHash('sha256').update(manifestPath).digest('hex').slice(0, 12);
    const promptDir = path.join(cacheRoot, `${version}-${manifestHash}`);
    const promptPath = path.join(
      promptDir,
      region === 'CN'
        ? 'dependency_install_llm_cn.generated.llm.txt'
        : 'dependency_install_llm_intl.generated.llm.txt',
    );

    await fs.mkdir(promptDir, { recursive: true });
    await fs.writeFile(promptPath, promptContent, 'utf-8');
    return promptPath;
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
      const lookupCommand = process.platform === 'win32' ? 'where' : 'command';
      const lookupArgs = process.platform === 'win32' ? [candidate] : ['-v', candidate];
      try {
        const lookupResult = await executeCli({
          command: lookupCommand,
          args: lookupArgs,
          env: runtimeEnv,
          windowsHide: true,
          metadata: { component: 'LlmInstallationManager', phase: 'precheck_lookup', candidate },
        });
        if (!lookupResult.success) {
          continue;
        }
        const firstLine = lookupResult.stdout
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
    const result = await executeCli({
      command,
      args,
      env,
      shell: true,
      windowsHide: true,
      timeoutMs,
      metadata: { component: 'LlmInstallationManager', phase: 'precheck_probe' },
    });

    return {
      exitCode: result.error?.kind === 'timeout' ? 124 : result.exitCode ?? 1,
      stdout: result.stdout,
      stderr: result.error?.kind === 'timeout'
        ? `${result.stderr}\nprobe timeout`
        : result.error?.kind === 'spawn'
          ? `${result.stderr}\n${result.error.message}`
          : result.stderr,
    };
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
