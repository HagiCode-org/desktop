import { ipcMain } from 'electron';
import { DiagnosisManager } from '../../diagnosis-manager.js';
import { LlmInstallationManager } from '../../llm-installation-manager.js';
import log from 'electron-log';

// Module state
interface DiagnosisHandlerState {
  diagnosisManager: DiagnosisManager | null;
  llmInstallationManager: LlmInstallationManager | null;
}

const state: DiagnosisHandlerState = {
  diagnosisManager: null,
  llmInstallationManager: null,
};

/**
 * Initialize diagnosis handlers with dependencies
 */
export function initDiagnosisHandlers(
  diagnosisManager: DiagnosisManager | null,
  llmInstallationManager: LlmInstallationManager | null
): void {
  state.diagnosisManager = diagnosisManager;
  state.llmInstallationManager = llmInstallationManager;
}

/**
 * Register diagnosis IPC handlers
 */
export function registerDiagnosisHandlers(deps: {
  diagnosisManager: DiagnosisManager | null;
  llmInstallationManager: LlmInstallationManager | null;
}): void {
  state.diagnosisManager = deps.diagnosisManager;
  state.llmInstallationManager = deps.llmInstallationManager;

  // Diagnosis: Open prompt handler
  ipcMain.handle('diagnosis:open-prompt', async () => {
    log.info('[DiagnosisHandlers] diagnosis:open-prompt called');

    // Validate dependencies
    if (!state.diagnosisManager) {
      log.error('[DiagnosisHandlers] DiagnosisManager not initialized');
      return {
        success: false,
        error: '诊断管理器未初始化',
      };
    }

    if (!state.llmInstallationManager) {
      log.error('[DiagnosisHandlers] LlmInstallationManager not initialized');
      return {
        success: false,
        error: 'LLM 安装管理器未初始化',
      };
    }

    try {
      // Validate that the diagnosis prompt file exists
      const validation = await state.diagnosisManager.validatePrompt();
      if (!validation.valid) {
        log.error('[DiagnosisHandlers] Diagnosis prompt validation failed:', validation.error);
        return {
          success: false,
          error: validation.error || '诊断提示词文件验证失败',
        };
      }

      // Get the path to the diagnosis prompt file
      const promptPath = state.diagnosisManager.getDiagnosisPromptPath();
      log.info('[DiagnosisHandlers] Opening AI CLI with diagnosis prompt:', promptPath);

      // Use LlmInstallationManager to open the AI CLI with the prompt
      await state.llmInstallationManager.openAICliWithPrompt(promptPath);

      log.info('[DiagnosisHandlers] AI CLI opened successfully');
      return {
        success: true,
        message: 'AI 诊断已启动',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('[DiagnosisHandlers] Failed to open diagnosis prompt:', errorMessage);
      log.error('[DiagnosisHandlers] Error details:', error);
      return {
        success: false,
        error: `启动 AI 诊断失败: ${errorMessage}`,
      };
    }
  });

  log.info('[IPC] Diagnosis handlers registered');
}
