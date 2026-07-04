import type { ConfigManager } from './config.js';
import type {
  DebugOptionsSaveResult,
  DebugOptionsSettings,
  DebugOptionsSettingsSnapshot,
} from '../types/debug-options.js';

type DebugOptionsConfigManager = Pick<ConfigManager,
  'getDebugOptionsSettings'
  | 'setDebugOptionsSettings'
  | 'getMsstoreRatingPromptState'
  | 'setMsstoreRatingPromptState'
>;

function normalizeInstallDateRaw(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function calculateInstallAgeDays(installDateRaw: string | undefined): number | null {
  if (!installDateRaw) {
    return null;
  }

  const installTime = Date.parse(installDateRaw);
  if (Number.isNaN(installTime)) {
    return null;
  }

  const diffMs = Date.now() - installTime;
  return diffMs >= 0 ? Math.floor(diffMs / (24 * 60 * 60 * 1000)) : 0;
}

function areDebugOptionsEqual(
  left: DebugOptionsSettings,
  right: DebugOptionsSettings,
): boolean {
  return left.useIgnoreScriptsForManagedNpm === right.useIgnoreScriptsForManagedNpm
    && (left.msstoreInstallDateRaw ?? '') === (right.msstoreInstallDateRaw ?? '');
}

export function createDebugOptionsSettingsSnapshot(
  configManager: DebugOptionsConfigManager,
): DebugOptionsSettingsSnapshot {
  const settings = configManager.getDebugOptionsSettings();
  const installDateRaw = normalizeInstallDateRaw(configManager.getMsstoreRatingPromptState().installDate);

  return {
    ...settings,
    msstoreInstallDateRaw: installDateRaw,
    msstoreInstallAgeDays: calculateInstallAgeDays(installDateRaw),
  };
}

export async function saveDebugOptionsSettings(options: {
  settings: DebugOptionsSettings;
  configManager: DebugOptionsConfigManager;
}): Promise<DebugOptionsSaveResult> {
  const previousSettings = options.configManager.getDebugOptionsSettings();
  const previousInstallDateRaw = normalizeInstallDateRaw(options.configManager.getMsstoreRatingPromptState().installDate);
  const nextSettings = options.settings;
  const nextInstallDateRaw = normalizeInstallDateRaw(nextSettings.msstoreInstallDateRaw);

  if (areDebugOptionsEqual(
    {
      ...previousSettings,
      msstoreInstallDateRaw: previousInstallDateRaw,
    },
    {
      ...nextSettings,
      msstoreInstallDateRaw: nextInstallDateRaw,
    },
  )) {
    return {
      status: 'unchanged',
      previousSettings: {
        ...previousSettings,
        msstoreInstallDateRaw: previousInstallDateRaw,
      },
      nextSettings: {
        ...previousSettings,
        msstoreInstallDateRaw: previousInstallDateRaw,
      },
      restartAttempted: false,
      restartCompleted: false,
      settings: createDebugOptionsSettingsSnapshot(options.configManager),
    };
  }

  const savedSettings = options.configManager.setDebugOptionsSettings({
    useIgnoreScriptsForManagedNpm: nextSettings.useIgnoreScriptsForManagedNpm,
  });

  options.configManager.setMsstoreRatingPromptState({
    installDate: nextInstallDateRaw,
  });

  return {
    status: 'saved',
    previousSettings: {
      ...previousSettings,
      msstoreInstallDateRaw: previousInstallDateRaw,
    },
    nextSettings: {
      ...savedSettings,
      msstoreInstallDateRaw: nextInstallDateRaw,
    },
    restartAttempted: false,
    restartCompleted: false,
    settings: createDebugOptionsSettingsSnapshot(options.configManager),
  };
}
