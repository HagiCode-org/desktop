import type { Version } from '../version-manager.js';
import type { HybridDownloadPolicy, SharingAccelerationSettings } from '../../types/sharing-acceleration.js';
import type { DistributionMode } from '../../types/distribution-mode.js';

export class DistributionPolicyEvaluator {
  evaluate(
    version: Version,
    settings: SharingAccelerationSettings,
    options?: { distributionMode?: DistributionMode },
  ): HybridDownloadPolicy {
    const thresholdBytes = settings.hybridThresholdMb * 1024 * 1024;
    if (version.sourceType !== 'http-index') {
      return { useHybrid: false, reason: 'not-http-index', thresholdBytes };
    }
    if (!version.hybrid) {
      return { useHybrid: false, reason: 'not-eligible', thresholdBytes };
    }
    if (!version.hybrid.eligible || version.hybrid.legacyHttpFallback) {
      return { useHybrid: false, reason: 'legacy-http', thresholdBytes };
    }
    if (options?.distributionMode === 'steam') {
      return { useHybrid: false, reason: 'portable-mode', thresholdBytes };
    }
    if (!settings.enabled) {
      return { useHybrid: false, reason: 'shared-disabled', thresholdBytes };
    }
    if (!version.hybrid.isLatestDesktopAsset && !version.hybrid.isLatestWebAsset) {
      return { useHybrid: false, reason: 'latest-only', thresholdBytes };
    }
    return { useHybrid: true, reason: 'shared-enabled', thresholdBytes };
  }
}
