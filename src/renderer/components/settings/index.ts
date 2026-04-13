import type { DistributionMode } from '../../../types/distribution-mode';

export { LanguageSelector } from './LanguageSelector';
export { OnboardingSettings } from './OnboardingSettings';
export { AgentCliSettings } from './AgentCliSettings';
export { DataDirectorySettings } from './DataDirectorySettings';
export { RemoteModeSettings } from './RemoteModeSettings';
export { SharingAccelerationSettings } from './SharingAccelerationSettings';

export function shouldShowSharingAccelerationSettings(distributionMode: DistributionMode): boolean {
  return distributionMode !== 'steam';
}
