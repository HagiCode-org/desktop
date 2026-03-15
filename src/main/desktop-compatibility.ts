import { clean, compare, valid } from 'semver';
import type { Manifest } from './manifest-reader.js';

export interface DesktopCompatibilityDetails {
  declared: boolean;
  compatible: boolean;
  requiredVersion?: string;
  currentVersion: string;
  message?: string;
  reason?: string;
}

function normalizeVersion(version: string): string | undefined {
  if (!version) {
    return undefined;
  }

  return clean(version) ?? valid(version) ?? undefined;
}

export function buildDesktopCompatibilityReason(
  requiredVersion: string,
  currentVersion: string,
  message?: string,
): string {
  const guidance = `Package requires Hagicode Desktop >= ${requiredVersion}. Current Desktop version is ${currentVersion}. Upgrade Desktop before retrying.`;
  if (!message) {
    return guidance;
  }

  return `${guidance} ${message}`;
}

export function evaluateDesktopCompatibility(
  manifest: Manifest | null | undefined,
  currentDesktopVersion: string,
): DesktopCompatibilityDetails {
  const normalizedCurrentVersion = normalizeVersion(currentDesktopVersion) ?? currentDesktopVersion;
  const declaredCompatibility = manifest?.desktopCompatibility;
  const minVersion = declaredCompatibility?.minVersion?.trim();
  const maintainerMessage = declaredCompatibility?.message?.trim() || undefined;

  if (!minVersion) {
    return {
      declared: false,
      compatible: true,
      currentVersion: normalizedCurrentVersion,
    };
  }

  const normalizedMinimumVersion = normalizeVersion(minVersion);
  if (!normalizedMinimumVersion) {
    return {
      declared: true,
      compatible: false,
      requiredVersion: minVersion,
      currentVersion: normalizedCurrentVersion,
      message: maintainerMessage,
      reason: `Package declares an invalid desktopCompatibility.minVersion value: ${minVersion}.`,
    };
  }

  const normalizedCurrentDesktopVersion = normalizeVersion(currentDesktopVersion);
  if (!normalizedCurrentDesktopVersion) {
    return {
      declared: true,
      compatible: false,
      requiredVersion: normalizedMinimumVersion,
      currentVersion: currentDesktopVersion,
      message: maintainerMessage,
      reason: `Current Desktop version is not a valid semantic version: ${currentDesktopVersion}.`,
    };
  }

  if (compare(normalizedCurrentDesktopVersion, normalizedMinimumVersion) < 0) {
    return {
      declared: true,
      compatible: false,
      requiredVersion: normalizedMinimumVersion,
      currentVersion: normalizedCurrentDesktopVersion,
      message: maintainerMessage,
      reason: buildDesktopCompatibilityReason(
        normalizedMinimumVersion,
        normalizedCurrentDesktopVersion,
        maintainerMessage,
      ),
    };
  }

  return {
    declared: true,
    compatible: true,
    requiredVersion: normalizedMinimumVersion,
    currentVersion: normalizedCurrentDesktopVersion,
    message: maintainerMessage,
  };
}
