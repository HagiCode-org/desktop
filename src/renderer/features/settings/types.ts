import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { DistributionModeState } from '../../../types/distribution-mode';

export type SettingsTabId =
  | 'notification'
  | 'onboarding'
  | 'dependencyManagement'
  | 'updates'
  | 'runtimeData'
  | 'debugOptions'
  | 'sharingAcceleration'
  | 'language';

export interface SettingsTabComponentProps {
  distributionState: DistributionModeState;
}

export type SettingsTabLoader = () => Promise<{ default: ComponentType<SettingsTabComponentProps> }>;

export interface SettingsTabConfig {
  id: SettingsTabId;
  labelKey: string;
  icon: LucideIcon;
  loader: SettingsTabLoader;
}
