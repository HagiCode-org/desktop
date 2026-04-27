import type { DistributionMode } from '../../../types/distribution-mode';

export { LanguageSelector } from './LanguageSelector';
export { OnboardingSettings } from './OnboardingSettings';
export { SharingAccelerationSettings } from './SharingAccelerationSettings';
export { VersionUpdateSettings } from './VersionUpdateSettings';

export function shouldShowSharingAccelerationSettings(distributionMode: DistributionMode): boolean {
  return distributionMode !== 'steam';
}
