import { electron } from '../../../electron-api.js';
import { PathManager } from '../../path-manager.js';
import type { RegionDetector } from '../../region-detector.js';
import type { VersionManager } from '../../version-manager.js';
import { loadLlmPromptFromManifest, type LlmPromptRegionOverride } from '../../llm-prompt-loader.js';
import {
  PromptResourceResolver,
  type PromptResourceKey,
} from '../../prompt-resource-resolver.js';
import { PromptGuidanceService } from '../../prompt-guidance-service.js';

const { app, ipcMain } = electron;

// Module state
interface LlmHandlerState {
  versionManager: VersionManager | null;
  promptResourceResolver: PromptResourceResolver | null;
  regionDetector: RegionDetector | null;
}

const state: LlmHandlerState = {
  versionManager: null,
  promptResourceResolver: null,
  regionDetector: null,
};

/**
 * Initialize LLM handlers with dependencies
 */
export function initLlmHandlers(
  versionManager: VersionManager | null = null,
  promptResourceResolver: PromptResourceResolver | null = null,
  regionDetector: RegionDetector | null = null,
): void {
  state.versionManager = versionManager;
  state.promptResourceResolver = promptResourceResolver;
  state.regionDetector = regionDetector;
}

/**
 * Register LLM installation IPC handlers
 */
export function registerLlmHandlers(deps: {
  versionManager?: VersionManager | null;
  promptResourceResolver?: PromptResourceResolver | null;
  regionDetector?: RegionDetector | null;
}): void {
  state.versionManager = deps.versionManager || null;
  state.promptResourceResolver = deps.promptResourceResolver || null;
  state.regionDetector = deps.regionDetector || null;

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
    loadVersionPrompt: state.regionDetector
      ? ((manifestPath: string, region?: LlmPromptRegionOverride) => {
          return loadLlmPromptFromManifest(manifestPath, state.regionDetector!, region);
        })
      : null,
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

  console.log('[IPC] LLM handlers registered');
}
