import { buildStartupFailurePayload } from './startup-failure-payload.js';
import type { StartResult } from './manifest-reader.js';
import type {
  OnboardingRecoveryResult,
  OnboardingStartServiceResult,
} from '../types/onboarding.js';

interface StartupRecoveryDeps<TInstalledVersion = unknown, TActiveVersion = unknown> {
  versionId: string;
  reinstallVersion: (versionId: string) => Promise<{ success: boolean; error?: string }>;
  getInstalledVersions: () => Promise<TInstalledVersion[]>;
  getActiveVersion: () => Promise<TActiveVersion>;
  resetOnboarding: () => Promise<void>;
  sendProgressEvent: (channel: string, data?: unknown) => void;
}

export function buildOnboardingStartupFailureResult(
  startResult: StartResult,
  fallbackPort: number
): OnboardingStartServiceResult {
  const startupFailure = buildStartupFailurePayload(startResult, fallbackPort);

  return {
    success: false,
    error: startupFailure.summary || 'Failed to start service',
    startupFailure,
  };
}

export async function recoverOnboardingStartupFailure<TInstalledVersion = unknown, TActiveVersion = unknown>(
  deps: StartupRecoveryDeps<TInstalledVersion, TActiveVersion>
): Promise<OnboardingRecoveryResult> {
  const reinstallResult = await deps.reinstallVersion(deps.versionId);
  if (!reinstallResult.success) {
    return {
      success: false,
      error: reinstallResult.error || 'Failed to reinstall version',
    };
  }

  const installedVersions = await deps.getInstalledVersions();
  deps.sendProgressEvent('version:installedVersionsChanged', installedVersions);

  const activeVersion = await deps.getActiveVersion();
  deps.sendProgressEvent('version:activeVersionChanged', activeVersion);

  await deps.resetOnboarding();
  deps.sendProgressEvent('onboarding:show');

  return { success: true };
}
