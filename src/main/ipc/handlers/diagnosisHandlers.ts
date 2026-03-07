import { app, ipcMain } from 'electron';
import { DiagnosisManager } from '../../diagnosis-manager.js';
import { LlmInstallationManager } from '../../llm-installation-manager.js';
import type { VersionManager } from '../../version-manager.js';
import { PromptResourceResolver } from '../../prompt-resource-resolver.js';
import type AgentCliManager from '../../agent-cli-manager.js';
import log from 'electron-log';

// Module state
interface DiagnosisHandlerState {
  diagnosisManager: DiagnosisManager | null;
  llmInstallationManager: LlmInstallationManager | null;
  versionManager: VersionManager | null;
  promptResourceResolver: PromptResourceResolver | null;
  agentCliManager: AgentCliManager | null;
}

const state: DiagnosisHandlerState = {
  diagnosisManager: null,
  llmInstallationManager: null,
  versionManager: null,
  promptResourceResolver: null,
  agentCliManager: null,
};

/**
 * Initialize diagnosis handlers with dependencies
 */
export function initDiagnosisHandlers(
  diagnosisManager: DiagnosisManager | null,
  llmInstallationManager: LlmInstallationManager | null,
  versionManager: VersionManager | null,
  promptResourceResolver: PromptResourceResolver | null,
  agentCliManager: AgentCliManager | null,
): void {
  state.diagnosisManager = diagnosisManager;
  state.llmInstallationManager = llmInstallationManager;
  state.versionManager = versionManager;
  state.promptResourceResolver = promptResourceResolver;
  state.agentCliManager = agentCliManager;
}

/**
 * Register diagnosis IPC handlers
 */
export function registerDiagnosisHandlers(deps: {
  diagnosisManager: DiagnosisManager | null;
  llmInstallationManager: LlmInstallationManager | null;
  versionManager?: VersionManager | null;
  promptResourceResolver?: PromptResourceResolver | null;
  agentCliManager?: AgentCliManager | null;
}): void {
  state.diagnosisManager = deps.diagnosisManager;
  state.llmInstallationManager = deps.llmInstallationManager;
  state.versionManager = deps.versionManager || null;
  state.promptResourceResolver = deps.promptResourceResolver || null;
  state.agentCliManager = deps.agentCliManager || null;

  // Diagnosis: Open prompt handler
  ipcMain.handle('diagnosis:open-prompt', async () => {
    log.info('[DiagnosisHandlers] diagnosis:open-prompt called');

    if (!state.llmInstallationManager) {
      log.error('[DiagnosisHandlers] LlmInstallationManager not initialized');
      return {
        success: false,
        errorCode: 'MANAGER_NOT_INITIALIZED',
        error: 'LLM 安装管理器未初始化',
      };
    }

    if (!state.promptResourceResolver) {
      log.error('[DiagnosisHandlers] PromptResourceResolver not initialized');
      return {
        success: false,
        errorCode: 'RESOLVER_NOT_INITIALIZED',
        error: '提示词解析器未初始化',
      };
    }

    try {
      const activeVersion = state.versionManager
        ? await state.versionManager.getActiveVersion()
        : null;

      const resolution = await state.promptResourceResolver.resolve({
        resourceKey: 'diagnosis',
        activeVersion: activeVersion
          ? {
              id: activeVersion.id,
              installedPath: activeVersion.installedPath,
            }
          : null,
        runtime: {
          isPackaged: app.isPackaged,
          appPath: app.getAppPath(),
          cwd: process.cwd(),
          processResourcesPath: process.resourcesPath,
        },
      });

      if (!resolution.success) {
        log.error('[DiagnosisHandlers] Diagnosis prompt resolution failed:', resolution);
        return {
          success: false,
          errorCode: resolution.errorCode,
          resourceKey: resolution.resourceKey,
          attemptedPaths: resolution.attemptedPaths,
          activeVersion: resolution.activeVersion,
          error: resolution.error,
        };
      }

      log.info('[DiagnosisHandlers] Opening AI CLI with diagnosis prompt:', resolution.resolvedPath);

      // Use LlmInstallationManager to open the AI CLI with the prompt
      let commandName = 'claude';
      if (state.agentCliManager) {
        const selectedCliType = state.agentCliManager.getSelectedCliType();
        if (selectedCliType) {
          commandName = state.agentCliManager.getCommandName(selectedCliType);
          log.info('[DiagnosisHandlers] Using CLI command from agent setting:', commandName);
        } else {
          log.info('[DiagnosisHandlers] No CLI selected, fallback to claude');
        }
      }
      await state.llmInstallationManager.openAICliWithPrompt(resolution.resolvedPath, commandName);

      log.info('[DiagnosisHandlers] AI CLI opened successfully');
      return {
        success: true,
        message: 'AI 诊断已启动',
        resourceKey: resolution.resourceKey,
        promptPath: resolution.resolvedPath,
        promptSource: resolution.source,
        attemptedPaths: resolution.attemptedPaths,
        activeVersion: resolution.activeVersion,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('[DiagnosisHandlers] Failed to open diagnosis prompt:', errorMessage);
      log.error('[DiagnosisHandlers] Error details:', error);
      return {
        success: false,
        errorCode: 'CLI_LAUNCH_FAILED',
        error: `启动 AI 诊断失败: ${errorMessage}`,
      };
    }
  });

  log.info('[IPC] Diagnosis handlers registered');
}
