import type { DistributionMode } from '../../../types/distribution-mode';

export { DependencyManagementModeSettings } from './DependencyManagementModeSettings';
export { LanguageSelector } from './LanguageSelector';
export { OnboardingSettings } from './OnboardingSettings';
export { RuntimeDataPathSettings } from './RuntimeDataPathSettings';
export { SharingAccelerationSettings } from './SharingAccelerationSettings';
export { VersionUpdateSettings } from './VersionUpdateSettings';

export function shouldShowSharingAccelerationSettings(distributionMode: DistributionMode): boolean {
  return distributionMode !== 'steam';
}
