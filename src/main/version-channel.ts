import { clean, prerelease, valid } from 'semver';

/** Minimal shape needed to decide which release channel a package version belongs to. */
export interface ChannelAwareVersion {
  version: string;
  channel?: string;
}

/**
 * A version is "stable" when it is a semver release without a prerelease tag. The semver string is
 * authoritative: legacy indexes without a `channels` object label every version "beta", so the
 * `channel` field is only consulted when the version is not parseable.
 */
export function isStableVersion(candidate: ChannelAwareVersion): boolean {
  const normalized = valid(candidate.version) ? candidate.version : clean(candidate.version);
  if (normalized) {
    return prerelease(normalized) === null;
  }
  return candidate.channel === 'stable';
}

function normalizePreference(preferredChannel: string | null | undefined): string | null {
  const value = preferredChannel?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Restrict update candidates to the channel the user follows.
 *
 * - An explicit `defaultChannel` of "stable" keeps stable releases only; any other explicit channel
 *   (e.g. "beta") follows every release.
 * - Without a preference, stable installs only follow stable releases (a newer prerelease must not be
 *   offered to them), while prerelease installs follow everything so they roll onto the stable release.
 */
export function filterUpdateCandidatesByChannel<T extends ChannelAwareVersion>(
  versions: readonly T[],
  options: { preferredChannel?: string | null; currentVersion?: string | null },
): T[] {
  const preferred = normalizePreference(options.preferredChannel);
  if (preferred) {
    return preferred === 'stable' ? versions.filter(isStableVersion) : [...versions];
  }

  const currentIsStable = options.currentVersion ? isStableVersion({ version: options.currentVersion }) : false;
  return currentIsStable ? versions.filter(isStableVersion) : [...versions];
}

/**
 * Pick the package a first-time install should use from a newest-first list. Stable releases win over
 * newer prereleases unless the user explicitly follows another channel; when no stable release exists
 * yet the newest available version is used.
 */
export function pickInstallCandidate<T extends ChannelAwareVersion>(
  versionsNewestFirst: readonly T[],
  preferredChannel?: string | null,
): T | undefined {
  const preferred = normalizePreference(preferredChannel);
  if (preferred && preferred !== 'stable') {
    return versionsNewestFirst[0];
  }
  return versionsNewestFirst.find(isStableVersion) ?? versionsNewestFirst[0];
}
