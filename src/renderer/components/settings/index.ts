import type { DistributionModeState } from '../../../types/distribution-mode';

export { DependencyManagementModeSettings } from './DependencyManagementModeSettings';
export { DebugOptionsSettings } from './DebugOptionsSettings';
export { LanguageSelector } from './LanguageSelector';
export { OnboardingSettings } from './OnboardingSettings';
export { RuntimeDataPathSettings } from './RuntimeDataPathSettings';
export { SharingAccelerationSettings } from './SharingAccelerationSettings';
export { VersionUpdateSettings } from './VersionUpdateSettings';

export function shouldShowSharingAccelerationSettings(distributionState: Pick<DistributionModeState, 'fusionMode'>): boolean {
  return !distributionState.fusionMode;
}
