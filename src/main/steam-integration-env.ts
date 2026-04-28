import type { DistributionMode } from '../types/distribution-mode.js';

export const HAGICODE_STEAM_MODE_ENV_KEY = 'HAGICODE_MODE';
export const HAGICODE_STEAM_MODE_ENV_VALUE = 'steam';
export const HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY = 'HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED';

export interface SteamIntegrationResolutionInput {
  distributionMode?: DistributionMode | null;
  env?: Record<string, string | undefined>;
}

export interface SteamIntegrationResolution {
  integrationEnabled: boolean;
  integrationSource: 'distribution-mode' | 'non-steam';
  achievementSyncEnabled: boolean;
  achievementSyncSource: 'hagicode-env' | 'invalid-hagicode-env' | 'disabled-non-steam';
  rawAchievementSyncValue?: string;
}

export function normalizeSteamAchievementSyncEnvValue(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return null;
}

export function resolveSteamIntegration(input: SteamIntegrationResolutionInput = {}): SteamIntegrationResolution {
  const env = input.env ?? process.env;
  const integrationEnabled = input.distributionMode === 'steam';
  const rawAchievementSyncValue = env[HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY];
  const normalizedAchievementSync = normalizeSteamAchievementSyncEnvValue(rawAchievementSyncValue);

  if (!integrationEnabled) {
    return {
      integrationEnabled: false,
      integrationSource: 'non-steam',
      achievementSyncEnabled: false,
      achievementSyncSource: 'disabled-non-steam',
      rawAchievementSyncValue,
    };
  }

  return {
    integrationEnabled: true,
    integrationSource: 'distribution-mode',
    achievementSyncEnabled: normalizedAchievementSync === true,
    achievementSyncSource: normalizedAchievementSync == null ? 'invalid-hagicode-env' : 'hagicode-env',
    rawAchievementSyncValue,
  };
}
