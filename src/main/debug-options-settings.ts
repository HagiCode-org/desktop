import type { ConfigManager } from './config.js';
import type {
  DebugOptionsSaveResult,
  DebugOptionsSettings,
  DebugOptionsSettingsSnapshot,
} from '../types/debug-options.js';

type DebugOptionsConfigManager = Pick<ConfigManager, 'getDebugOptionsSettings' | 'setDebugOptionsSettings'>;

function areDebugOptionsEqual(
  left: DebugOptionsSettings,
  right: DebugOptionsSettings,
): boolean {
  return left.useIgnoreScriptsForManagedNpm === right.useIgnoreScriptsForManagedNpm;
}

export function createDebugOptionsSettingsSnapshot(
  configManager: DebugOptionsConfigManager,
): DebugOptionsSettingsSnapshot {
  return configManager.getDebugOptionsSettings();
}

export async function saveDebugOptionsSettings(options: {
  settings: DebugOptionsSettings;
  configManager: DebugOptionsConfigManager;
}): Promise<DebugOptionsSaveResult> {
  const previousSettings = options.configManager.getDebugOptionsSettings();
  const nextSettings = options.settings;

  if (areDebugOptionsEqual(previousSettings, nextSettings)) {
    return {
      status: 'unchanged',
      previousSettings,
      nextSettings: previousSettings,
      restartAttempted: false,
      restartCompleted: false,
      settings: createDebugOptionsSettingsSnapshot(options.configManager),
    };
  }

  const savedSettings = options.configManager.setDebugOptionsSettings(nextSettings);

  return {
    status: 'saved',
    previousSettings,
    nextSettings: savedSettings,
    restartAttempted: false,
    restartCompleted: false,
    settings: createDebugOptionsSettingsSnapshot(options.configManager),
  };
}
