import type { StartResult } from './manifest-reader.js';
import type { ConfigManager } from './config.js';
import { resolveManagedServerLauncherPath } from './managed-server-launcher.js';
import type { PCodeWebServiceManager } from './web-service-manager.js';
import type {
  DebugOptionsSaveResult,
  DebugOptionsSettings,
  DebugOptionsSettingsSnapshot,
} from '../types/debug-options.js';

type DebugOptionsConfigManager = Pick<ConfigManager, 'getDebugOptionsSettings' | 'setDebugOptionsSettings'>;
type DebugOptionsWebServiceManager = Pick<PCodeWebServiceManager, 'stop' | 'start'> & {
  getStatus: () => Promise<{ status: string }>;
};

function createStartFailureMessage(result: StartResult): string {
  return result.parsedResult.errorMessage
    ?? result.resultSession.stderr
    ?? result.resultSession.stdout
    ?? 'Managed service restart failed after saving the debug options.';
}

export function createDebugOptionsSettingsSnapshot(
  configManager: DebugOptionsConfigManager,
): DebugOptionsSettingsSnapshot {
  const configured = configManager.getDebugOptionsSettings();
  const managedServerLauncherPath = resolveManagedServerLauncherPath();

  return {
    ...configured,
    windowsStoreRuntime: managedServerLauncherPath !== null,
    managedServerLauncherPath,
  };
}

export async function saveDebugOptionsSettings(options: {
  settings: DebugOptionsSettings;
  configManager: DebugOptionsConfigManager;
  webServiceManager?: DebugOptionsWebServiceManager | null;
}): Promise<DebugOptionsSaveResult> {
  const previousSettings = options.configManager.getDebugOptionsSettings();
  const nextSettings = options.settings;

  if (previousSettings.usePsfForManagedServer === nextSettings.usePsfForManagedServer) {
    return {
      status: 'unchanged',
      previousSettings,
      nextSettings: previousSettings,
      restartAttempted: false,
      restartCompleted: false,
      settings: createDebugOptionsSettingsSnapshot(options.configManager),
    };
  }

  let shouldRestartRunningService = false;
  if (options.webServiceManager) {
    const currentStatus = await options.webServiceManager.getStatus();
    shouldRestartRunningService = currentStatus.status === 'running';
  }

  const savedSettings = options.configManager.setDebugOptionsSettings(nextSettings);

  if (!shouldRestartRunningService || !options.webServiceManager) {
    return {
      status: 'saved',
      previousSettings,
      nextSettings: savedSettings,
      restartAttempted: false,
      restartCompleted: false,
      settings: createDebugOptionsSettingsSnapshot(options.configManager),
    };
  }

  const stopped = await options.webServiceManager.stop();
  if (!stopped) {
    return {
      status: 'failed',
      previousSettings,
      nextSettings: savedSettings,
      restartAttempted: true,
      restartCompleted: false,
      settings: createDebugOptionsSettingsSnapshot(options.configManager),
      error: 'Failed to stop the running managed service. The new debug option was saved, but the active server still uses the previous launch mode until restart succeeds.',
    };
  }

  const startResult = await options.webServiceManager.start();
  if (!startResult.success) {
    return {
      status: 'failed',
      previousSettings,
      nextSettings: savedSettings,
      restartAttempted: true,
      restartCompleted: false,
      settings: createDebugOptionsSettingsSnapshot(options.configManager),
      error: createStartFailureMessage(startResult),
    };
  }

  return {
    status: 'saved',
    previousSettings,
    nextSettings: savedSettings,
    restartAttempted: true,
    restartCompleted: true,
    settings: createDebugOptionsSettingsSnapshot(options.configManager),
  };
}
