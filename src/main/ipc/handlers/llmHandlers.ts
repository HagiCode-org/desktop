import { app, ipcMain, BrowserWindow } from 'electron';
import { LlmInstallationManager } from '../../llm-installation-manager.js';
import { PathManager } from '../../path-manager.js';
import type { VersionManager } from '../../version-manager.js';
import {
  PromptResourceResolver,
  type PromptResolveFailure,
  type PromptResourceKey,
} from '../../prompt-resource-resolver.js';
import type AgentCliManager from '../../agent-cli-manager.js';

// Module state
interface LlmHandlerState {
  llmInstallationManager: LlmInstallationManager | null;
  mainWindow: BrowserWindow | null;
  agentCliManager: AgentCliManager | null;
  versionManager: VersionManager | null;
  promptResourceResolver: PromptResourceResolver | null;
}

const state: LlmHandlerState = {
  llmInstallationManager: null,
  mainWindow: null,
  agentCliManager: null,
  versionManager: null,
  promptResourceResolver: null,
};

/**
 * Initialize LLM handlers with dependencies
 */
export function initLlmHandlers(
  llmInstallationManager: LlmInstallationManager | null,
  mainWindow: BrowserWindow | null,
  agentCliManager: AgentCliManager | null = null,
  versionManager: VersionManager | null = null,
  promptResourceResolver: PromptResourceResolver | null = null,
): void {
  state.llmInstallationManager = llmInstallationManager;
  state.mainWindow = mainWindow;
  state.agentCliManager = agentCliManager;
  state.versionManager = versionManager;
  state.promptResourceResolver = promptResourceResolver;
}

/**
 * Register LLM installation IPC handlers
 */
export function registerLlmHandlers(deps: {
  llmInstallationManager: LlmInstallationManager | null;
  mainWindow: BrowserWindow | null;
  agentCliManager?: AgentCliManager | null;
  versionManager?: VersionManager | null;
  promptResourceResolver?: PromptResourceResolver | null;
}): void {
  state.llmInstallationManager = deps.llmInstallationManager;
  state.mainWindow = deps.mainWindow;
  state.agentCliManager = deps.agentCliManager || null;
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

      // Determine CLI command based on user selection
      let commandName = 'claude'; // Default fallback
      if (state.agentCliManager) {
        const selectedCliType = state.agentCliManager.getSelectedCliType();
        if (selectedCliType) {
          commandName = state.agentCliManager.getCommandName(selectedCliType);
          console.log('[LlmHandlers] Using CLI command:', commandName, 'for selected type:', selectedCliType);
        } else {
          console.log('[LlmHandlers] No CLI type selected, using default: claude');
        }
      } else {
        console.log('[LlmHandlers] AgentCliManager not available, using default: claude');
      }

      const result = await state.llmInstallationManager.callApi(prompt.filePath, event.sender, commandName);
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
      return { region: null };
    }
    return {
      region: state.llmInstallationManager.getRegion(),
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

  const getCommandName = () => {
    let commandName = 'claude';
    if (state.agentCliManager) {
      const selectedCliType = state.agentCliManager.getSelectedCliType();
      if (selectedCliType) {
        commandName = state.agentCliManager.getCommandName(selectedCliType);
        console.log('[LlmHandlers] Using CLI command:', commandName, 'for selected type:', selectedCliType);
      } else {
        console.log('[LlmHandlers] No CLI type selected, using default: claude');
      }
    } else {
      console.log('[LlmHandlers] AgentCliManager not available, using default: claude');
    }
    return commandName;
  };

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

  const mapPromptResolveFailure = (failure: PromptResolveFailure) => {
    return {
      success: false,
      errorCode: failure.errorCode,
      resourceKey: failure.resourceKey,
      attemptedPaths: failure.attemptedPaths,
      activeVersion: failure.activeVersion,
      error: failure.error,
    };
  };

  const launchWithResolvedPrompt = async (resourceKey: PromptResourceKey, customPromptPath?: string) => {
    if (!state.llmInstallationManager) {
      return {
        success: false,
        errorCode: 'MANAGER_NOT_INITIALIZED',
        error: 'LLM Installation Manager not initialized',
      };
    }

    if (!state.promptResourceResolver) {
      return {
        success: false,
        errorCode: 'RESOLVER_NOT_INITIALIZED',
        error: 'Prompt resource resolver not initialized',
      };
    }

    try {
      const resolution = await state.promptResourceResolver.resolve({
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

      if (!resolution.success) {
        return mapPromptResolveFailure(resolution);
      }

      await state.llmInstallationManager.openAICliWithPrompt(resolution.resolvedPath, getCommandName());
      return {
        success: true,
        message: 'AI CLI started successfully',
        resourceKey,
        promptPath: resolution.resolvedPath,
        promptSource: resolution.source,
        attemptedPaths: resolution.attemptedPaths,
        activeVersion: resolution.activeVersion,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LlmHandlers] Failed to open AI CLI with prompt:', errorMessage);
      return {
        success: false,
        errorCode: 'CLI_LAUNCH_FAILED',
        error: errorMessage,
      };
    }
  };

  // LLM open AI CLI with resource key handler
  ipcMain.handle('llm:open-ai-cli-with-resource', async (_event, resourceKey: PromptResourceKey, customPromptPath?: string) => {
    return launchWithResolvedPrompt(resourceKey, customPromptPath);
  });

  // LLM open AI CLI with prompt handler (compatibility path)
  ipcMain.handle('llm:open-ai-cli-with-prompt', async (_event, promptPath?: string) => {
    if (!promptPath || typeof promptPath !== 'string' || !promptPath.trim()) {
      return launchWithResolvedPrompt('smartConfig');
    }
    return launchWithResolvedPrompt('smartConfig', promptPath);
  });

  console.log('[IPC] LLM handlers registered');
}
