import {
  resolveDesktopCanonicalRuntimeDataRoot,
  resolveRuntimeDataRootOverridePath,
} from './runtime-data-root.js';
import type { ConfigManager } from './config.js';
import type { PathManager } from './path-manager.js';
import type { PCodeWebServiceManager } from './web-service-manager.js';
import type { StartResult } from './manifest-reader.js';
import type {
  RuntimeDataPathPreset,
  RuntimeDataPathSaveResult,
  RuntimeDataPathSettingsSnapshot,
} from '../types/runtime-data-path.js';

type RuntimeDataConfigManager = Pick<ConfigManager, 'getRuntimeDataPathPreset' | 'setRuntimeDataPathPreset'>;
type RuntimeDataPathManager = Pick<PathManager, 'getUserDataPath' | 'getRuntimeDataHome'> & {
  refreshRuntimeDataPaths: () => unknown;
};
type RuntimeDataWebServiceManager = Pick<PCodeWebServiceManager, 'stop' | 'start'> & {
  getStatus: () => Promise<{ status: string }>;
};

function createStartFailureMessage(result: StartResult): string {
  return result.parsedResult.errorMessage
    ?? result.resultSession.stderr
    ?? result.resultSession.stdout
    ?? 'Managed service restart failed after saving the runtime data path preset.';
}

export function createRuntimeDataPathSettingsSnapshot(
  configManager: RuntimeDataConfigManager,
  pathManager: RuntimeDataPathManager,
  options?: { isWindowsStore?: boolean },
): RuntimeDataPathSettingsSnapshot {
  const configuredPreset = configManager.getRuntimeDataPathPreset();
  const environmentOverrideRoot = resolveRuntimeDataRootOverridePath(process.env.HAGICODE_RUNTIME_DATA_HOME);
  const isLocked = Boolean(options?.isWindowsStore);
  return {
    configuredPreset,
    effectivePreset: configuredPreset,
    configuredRootPath: resolveDesktopCanonicalRuntimeDataRoot({
      preset: configuredPreset,
      userDataPath: pathManager.getUserDataPath(),
    }),
    effectiveRootPath: pathManager.getRuntimeDataHome(),
    environmentOverrideActive: environmentOverrideRoot !== null,
    environmentOverrideRoot,
    lockedByRuntime: isLocked,
    readOnlyReason: isLocked
      ? 'MSIX / Windows Store packaging locks the runtime data storage path to prevent configuration changes.'
      : undefined,
  };
}

export async function saveRuntimeDataPathPreset(options: {
  preset: RuntimeDataPathPreset;
  configManager: RuntimeDataConfigManager;
  pathManager: RuntimeDataPathManager;
  webServiceManager?: RuntimeDataWebServiceManager | null;
  isWindowsStore?: boolean;
}): Promise<RuntimeDataPathSaveResult> {
  if (options.isWindowsStore) {
    throw new Error('MSIX / Windows Store packaging locks the runtime data storage path to prevent configuration changes.');
  }

  const previousPreset = options.configManager.getRuntimeDataPathPreset();
  const nextPreset = options.preset;

  if (previousPreset === nextPreset) {
    return {
      status: 'unchanged',
      previousPreset,
      nextPreset,
      restartAttempted: false,
      restartCompleted: false,
      settings: createRuntimeDataPathSettingsSnapshot(options.configManager, options.pathManager),
    };
  }

  let shouldRestartRunningService = false;
  if (options.webServiceManager) {
    const currentStatus = await options.webServiceManager.getStatus();
    shouldRestartRunningService = currentStatus.status === 'running';
  }

  options.configManager.setRuntimeDataPathPreset(nextPreset);

  if (!shouldRestartRunningService || !options.webServiceManager) {
    options.pathManager.refreshRuntimeDataPaths();
    return {
      status: 'restarted',
      previousPreset,
      nextPreset,
      restartAttempted: false,
      restartCompleted: false,
      settings: createRuntimeDataPathSettingsSnapshot(options.configManager, options.pathManager),
    };
  }

  const stopped = await options.webServiceManager.stop();
  if (!stopped) {
    return {
      status: 'failed',
      previousPreset,
      nextPreset,
      restartAttempted: true,
      restartCompleted: false,
      settings: createRuntimeDataPathSettingsSnapshot(options.configManager, options.pathManager),
      error: 'Failed to stop the running managed service. The new preset was saved, but the active runtime data root is still using the previous path until the service can be restarted.',
    };
  }

  options.pathManager.refreshRuntimeDataPaths();
  const startResult = await options.webServiceManager.start();
  if (!startResult.success) {
    return {
      status: 'failed',
      previousPreset,
      nextPreset,
      restartAttempted: true,
      restartCompleted: false,
      settings: createRuntimeDataPathSettingsSnapshot(options.configManager, options.pathManager),
      error: createStartFailureMessage(startResult),
    };
  }

  return {
    status: 'restarted',
    previousPreset,
    nextPreset,
    restartAttempted: true,
    restartCompleted: true,
    settings: createRuntimeDataPathSettingsSnapshot(options.configManager, options.pathManager),
  };
}
