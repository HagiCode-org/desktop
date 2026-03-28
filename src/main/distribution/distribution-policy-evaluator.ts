import type { Version } from '../version-manager.js';
import type { HybridDownloadPolicy, SharingAccelerationSettings } from '../../types/sharing-acceleration.js';
import type { DistributionMode } from '../../types/distribution-mode.js';

export class DistributionPolicyEvaluator {
  evaluate(
    version: Version,
    settings: SharingAccelerationSettings,
    options?: { distributionMode?: DistributionMode },
  ): HybridDownloadPolicy {
    const thresholdBytes = version.hybrid?.thresholdBytes ?? 0;
    const serviceScope = version.hybrid?.serviceScope ?? 'local-cache';
    const seedEligible = Boolean(version.hybrid?.isLatestDesktopAsset || version.hybrid?.isLatestWebAsset);
    if (version.sourceType !== 'http-index') {
      return { useHybrid: false, preferTorrent: false, reason: 'not-http-index', thresholdBytes, serviceScope, seedEligible };
    }
    if (!version.hybrid) {
      return { useHybrid: false, preferTorrent: false, reason: 'not-eligible', thresholdBytes, serviceScope, seedEligible };
    }
    if (!version.hybrid.hasTorrentMetadata || !version.hybrid.eligible || version.hybrid.legacyHttpFallback) {
      return { useHybrid: false, preferTorrent: false, reason: 'legacy-http', thresholdBytes, serviceScope, seedEligible };
    }
    if (options?.distributionMode === 'steam') {
      return { useHybrid: false, preferTorrent: false, reason: 'portable-mode', thresholdBytes, serviceScope, seedEligible };
    }
    if (!settings.enabled) {
      return { useHybrid: false, preferTorrent: false, reason: 'shared-disabled', thresholdBytes, serviceScope, seedEligible };
    }
    return { useHybrid: true, preferTorrent: version.hybrid.torrentFirst, reason: 'shared-enabled', thresholdBytes, serviceScope, seedEligible };
  }
}
