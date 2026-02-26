import { ipcMain, BrowserWindow } from 'electron';
import { LlmInstallationManager } from '../../llm-installation-manager.js';
import { PathManager } from '../../path-manager.js';

// Module state
interface LlmHandlerState {
  llmInstallationManager: LlmInstallationManager | null;
  mainWindow: BrowserWindow | null;
}

const state: LlmHandlerState = {
  llmInstallationManager: null,
  mainWindow: null,
};

/**
 * Initialize LLM handlers with dependencies
 */
export function initLlmHandlers(
  llmInstallationManager: LlmInstallationManager | null,
  mainWindow: BrowserWindow | null
): void {
  state.llmInstallationManager = llmInstallationManager;
  state.mainWindow = mainWindow;
}

/**
 * Register LLM installation IPC handlers
 */
export function registerLlmHandlers(deps: {
  llmInstallationManager: LlmInstallationManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.llmInstallationManager = deps.llmInstallationManager;
  state.mainWindow = deps.mainWindow;

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
      const result = await state.llmInstallationManager.callClaudeAPI(prompt.filePath, event.sender);
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

  console.log('[IPC] LLM handlers registered');
}
