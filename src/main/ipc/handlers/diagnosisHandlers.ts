import { app, ipcMain } from 'electron';
import { DiagnosisManager } from '../../diagnosis-manager.js';
import { LlmInstallationManager } from '../../llm-installation-manager.js';
import type { VersionManager } from '../../version-manager.js';
import { PromptResourceResolver } from '../../prompt-resource-resolver.js';
import type AgentCliManager from '../../agent-cli-manager.js';
import log from 'electron-log';
import { PromptGuidanceService } from '../../prompt-guidance-service.js';

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
  const getDiagnosisPromptGuidance = async () => {
    log.info('[DiagnosisHandlers] diagnosis prompt guidance requested');

    const activeVersion = state.versionManager
      ? await state.versionManager.getActiveVersion()
      : null;

    const promptGuidanceService = new PromptGuidanceService({
      promptResourceResolver: state.promptResourceResolver,
      llmInstallationManager: state.llmInstallationManager,
      agentCliManager: state.agentCliManager,
    });

    return promptGuidanceService.buildResourceGuidance({
      entryPoint: 'diagnosis',
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
  };

  ipcMain.handle('diagnosis:get-prompt-guidance', async () => {
    return getDiagnosisPromptGuidance();
  });

  // Compatibility path kept for existing callers; now returns prompt guidance instead of launching a CLI.
  ipcMain.handle('diagnosis:open-prompt', async () => {
    return getDiagnosisPromptGuidance();
  });

  log.info('[IPC] Diagnosis handlers registered');
}
