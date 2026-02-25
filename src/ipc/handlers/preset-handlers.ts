import log from 'electron-log';
import { PresetLoader } from '../../services/preset-loader.js';
import { PresetCacheManager } from '../../services/preset-cache-manager.js';

/**
 * IPC Handler type for preset handlers
 */
type IPCInvokeHandler<T = void, R = any> = (
  _event: Electron.IpcMainInvokeEvent,
  ...args: any[]
) => Promise<R>;

/**
 * Preset IPC Handlers
 * Expose preset functionality to renderer process via IPC
 */

// Initialize services
let presetLoader: PresetLoader | null = null;
let presetCacheManager: PresetCacheManager | null = null;

/**
 * Initialize preset services (call this before registering handlers)
 */
export function initializePresetServices() {
  if (presetCacheManager) {
    log.warn('[PresetHandlers] Services already initialized');
    return;
  }

  presetCacheManager = new PresetCacheManager();
  presetLoader = new PresetLoader(presetCacheManager);

  log.info('[PresetHandlers] Preset services initialized');
}

/**
 * preset:fetch - Fetch presets with cache fallback
 */
export const presetFetchHandler: IPCInvokeHandler<void, any> = async (_event) => {
  try {
    if (!presetLoader) {
      throw new Error('Preset services not initialized');
    }

    log.info('[PresetHandlers] preset:fetch invoked');

    const result = await presetLoader.fetchPreset();

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[PresetHandlers] preset:fetch error:', errorMessage);

    return {
      success: false,
      error: errorMessage,
      source: 'fallback',
    };
  }
};

/**
 * preset:refresh - Force refresh presets from remote
 */
export const presetRefreshHandler: IPCInvokeHandler<void, any> = async (_event) => {
  try {
    if (!presetLoader) {
      throw new Error('Preset services not initialized');
    }

    log.info('[PresetHandlers] preset:refresh invoked');

    const result = await presetLoader.refreshPreset();

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[PresetHandlers] preset:refresh error:', errorMessage);

    return {
      success: false,
      error: errorMessage,
      source: 'fallback',
    };
  }
};

/**
 * preset:clear-cache - Clear preset cache
 */
export const presetClearCacheHandler: IPCInvokeHandler<void, any> = async (_event) => {
  try {
    if (!presetLoader) {
      throw new Error('Preset services not initialized');
    }

    log.info('[PresetHandlers] preset:clear-cache invoked');

    const result = await presetLoader.clearCache();

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[PresetHandlers] preset:clear-cache error:', errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * preset:get-provider - Get provider preset by ID
 */
export const presetGetProviderHandler: IPCInvokeHandler<string, any> = async (_event, providerId: string) => {
  try {
    if (!presetLoader) {
      throw new Error('Preset services not initialized');
    }

    log.info('[PresetHandlers] preset:get-provider invoked for:', providerId);

    const result = await presetLoader.getProviderPreset(providerId);

    return {
      success: result !== null,
      data: result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[PresetHandlers] preset:get-provider error:', errorMessage);

    return {
      success: false,
      error: errorMessage,
      data: null,
    };
  }
};

/**
 * preset:get-all-providers - Get all available providers
 */
export const presetGetAllProvidersHandler: IPCInvokeHandler<void, any> = async (_event) => {
  try {
    if (!presetLoader) {
      throw new Error('Preset services not initialized');
    }

    log.info('[PresetHandlers] preset:get-all-providers invoked');

    const providers = await presetLoader.getAvailableProviders();

    return {
      success: true,
      data: providers,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[PresetHandlers] preset:get-all-providers error:', errorMessage);

    return {
      success: false,
      error: errorMessage,
      data: {},
    };
  }
};

/**
 * preset:get-cache-stats - Get cache statistics
 */
export const presetGetCacheStatsHandler: IPCInvokeHandler<void, any> = async (_event) => {
  try {
    if (!presetLoader) {
      throw new Error('Preset services not initialized');
    }

    log.info('[PresetHandlers] preset:get-cache-stats invoked');

    const stats = await presetLoader.getCacheStats();

    return {
      success: true,
      data: stats,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[PresetHandlers] preset:get-cache-stats error:', errorMessage);

    return {
      success: false,
      error: errorMessage,
      data: null,
    };
  }
};

/**
 * Get preset loader instance (for internal use)
 */
export function getPresetLoader(): PresetLoader | null {
  return presetLoader;
}

/**
 * Get preset cache manager instance (for internal use)
 */
export function getPresetCacheManager(): PresetCacheManager | null {
  return presetCacheManager;
}
