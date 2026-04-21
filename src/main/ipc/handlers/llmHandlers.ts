import { app, ipcMain, BrowserWindow } from 'electron';
import { LlmInstallationManager } from '../../llm-installation-manager.js';
import { PathManager } from '../../path-manager.js';
import type { VersionManager } from '../../version-manager.js';
import {
  PromptResourceResolver,
  type PromptResourceKey,
} from '../../prompt-resource-resolver.js';
import { PromptGuidanceService } from '../../prompt-guidance-service.js';

// Module state
interface LlmHandlerState {
  llmInstallationManager: LlmInstallationManager | null;
  mainWindow: BrowserWindow | null;
  versionManager: VersionManager | null;
  promptResourceResolver: PromptResourceResolver | null;
}

const state: LlmHandlerState = {
  llmInstallationManager: null,
  mainWindow: null,
  versionManager: null,
  promptResourceResolver: null,
};

/**
 * Initialize LLM handlers with dependencies
 */
export function initLlmHandlers(
  llmInstallationManager: LlmInstallationManager | null,
  mainWindow: BrowserWindow | null,
  versionManager: VersionManager | null = null,
  promptResourceResolver: PromptResourceResolver | null = null,
): void {
  state.llmInstallationManager = llmInstallationManager;
  state.mainWindow = mainWindow;
  state.versionManager = versionManager;
  state.promptResourceResolver = promptResourceResolver;
}

/**
 * Register LLM installation IPC handlers
 */
export function registerLlmHandlers(deps: {
  llmInstallationManager: LlmInstallationManager | null;
  mainWindow: BrowserWindow | null;
  versionManager?: VersionManager | null;
  promptResourceResolver?: PromptResourceResolver | null;
}): void {
  state.llmInstallationManager = deps.llmInstallationManager;
  state.mainWindow = deps.mainWindow;
  state.versionManager = deps.versionManager || null;
  state.promptResourceResolver = deps.promptResourceResolver || null;

  // LLM load prompt handler
  ipcMain.handle('llm:load-prompt', async (_event, manifestPath: string, region?: 'cn' | 'international') => {
    if (!state.llmInstallationManager) {
      return {
        success: false,
        error: 'LLM Installation Manager not initialized',
      };
    }
    try {
      const prompt = await state.llmInstallationManager.loadPrompt(manifestPath, region);
      return {
        success: true,
        prompt: {
          version: prompt.version,
          content: prompt.content,
          region: prompt.region,
          filePath: prompt.filePath,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LlmHandlers] Failed to load LLM prompt:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  // LLM call API handler
  ipcMain.handle('llm:call-api', async (event, manifestPath: string, region?: 'cn' | 'international') => {
    if (!state.llmInstallationManager) {
      return {
        success: false,
        error: 'LLM Installation Manager not initialized',
      };
    }
    try {
      const prompt = await state.llmInstallationManager.loadPrompt(manifestPath, region);
      const result = await state.llmInstallationManager.callApi(prompt.filePath, event.sender, 'claude');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LlmHandlers] Failed to call LLM API:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  // LLM get region handler
  ipcMain.handle('llm:get-region', async () => {
    if (!state.llmInstallationManager) {
      return { success: false, region: null };
    }
    const detection = state.llmInstallationManager.getRegionStatus();
    return {
      success: true,
      region: detection.region,
      detectedAt: detection.detectedAt.toISOString(),
      method: detection.method,
      localeSnapshot: detection.localeSnapshot,
    };
  });

  // LLM get manifest path handler
  ipcMain.handle('llm:get-manifest-path', async (_event, versionId: string) => {
    try {
      const pathManager = PathManager.getInstance();
      const versionPath = pathManager.getInstalledVersionPath(versionId);
      const manifestPath = `${versionPath}/manifest.json`;
      console.log('[LlmHandlers] Getting manifest path for version:', versionId, '->', manifestPath);
      return {
        success: true,
        manifestPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LlmHandlers] Failed to get manifest path:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  const getActiveVersionContext = async () => {
    if (!state.versionManager) {
      return null;
    }
    const activeVersion = await state.versionManager.getActiveVersion();
    if (!activeVersion) {
      return null;
    }
    return {
      id: activeVersion.id,
      installedPath: activeVersion.installedPath,
    };
  };

  const getPromptGuidanceService = () => new PromptGuidanceService({
    promptResourceResolver: state.promptResourceResolver,
    llmInstallationManager: state.llmInstallationManager,
    resolveManifestPath: (versionId: string) => {
      const pathManager = PathManager.getInstance();
      const versionPath = pathManager.getInstalledVersionPath(versionId);
      return `${versionPath}/manifest.json`;
    },
  });

  const getPromptGuidance = async (resourceKey: PromptResourceKey, customPromptPath?: string) => {
    return getPromptGuidanceService().buildResourceGuidance({
      entryPoint: resourceKey,
      resourceKey,
      customPromptPath,
      activeVersion: await getActiveVersionContext(),
      runtime: {
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        cwd: process.cwd(),
        processResourcesPath: process.resourcesPath,
      },
    });
  };

  ipcMain.handle('llm:get-prompt-guidance', async (_event, resourceKey: PromptResourceKey, customPromptPath?: string) => {
    return getPromptGuidance(resourceKey, customPromptPath);
  });

  ipcMain.handle('llm:get-version-prompt-guidance', async (_event, versionId: string, region?: 'cn' | 'international') => {
    return getPromptGuidanceService().buildVersionGuidance({
      versionId,
      region,
    });
  });

  // Compatibility path kept for existing callers; now returns prompt guidance instead of launching a CLI.
  ipcMain.handle('llm:open-ai-cli-with-resource', async (_event, resourceKey: PromptResourceKey, customPromptPath?: string) => {
    return getPromptGuidance(resourceKey, customPromptPath);
  });

  // Compatibility path kept for existing callers; now returns prompt guidance instead of launching a CLI.
  ipcMain.handle('llm:open-ai-cli-with-prompt', async (_event, promptPath?: string) => {
    if (!promptPath || typeof promptPath !== 'string' || !promptPath.trim()) {
      return getPromptGuidance('smartConfig');
    }
    return getPromptGuidance('smartConfig', promptPath);
  });

  console.log('[IPC] LLM handlers registered');
}
