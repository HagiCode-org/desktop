export type DistributionMode = 'normal' | 'steam';

export type RuntimeSourceKind = 'installed-version' | 'portable-fixed';

export interface ActiveRuntimeDescriptor {
  kind: RuntimeSourceKind;
  rootPath: string;
  versionId?: string;
  versionLabel: string;
  displayName: string;
  isReadOnly: boolean;
}

export interface DistributionModeState {
  mode: DistributionMode;
  activeRuntime: ActiveRuntimeDescriptor | null;
}

export const PORTABLE_VERSION_MODE_ERROR =
  'Portable version mode is read-only. Updates and version changes are managed by the packaged distribution.';
