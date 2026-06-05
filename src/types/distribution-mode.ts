export type DistributionMode = 'normal' | 'fusion' | 'steam' | 'win-store';

export type DistributionMetadataMode = 'normal' | 'fusion';

export type DistributionChannel = 'none' | 'steam' | 'win-store';

export type RuntimeSourceKind = 'installed-version' | 'portable-fixed';

export interface DistributionMetadata {
  schemaVersion: number;
  mode: DistributionMetadataMode;
  channel: DistributionChannel;
  extensions: Record<string, unknown>;
}

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
  fusionMode: boolean;
  steamMode: boolean;
  winStoreMode: boolean;
  activeRuntime: ActiveRuntimeDescriptor | null;
  metadata: DistributionMetadata | null;
}

export interface ResolveDistributionModeStateOptions {
  metadata?: DistributionMetadata | null;
  hasBundledRuntime?: boolean;
  isWindowsStoreRuntime?: boolean;
  activeRuntime?: ActiveRuntimeDescriptor | null;
}

export function createDefaultDistributionModeState(): DistributionModeState {
  return {
    mode: 'normal',
    fusionMode: false,
    steamMode: false,
    winStoreMode: false,
    activeRuntime: null,
    metadata: null,
  };
}

export function isFusionDistributionMode(
  value: DistributionMode | Pick<DistributionModeState, 'fusionMode'> | null | undefined,
): boolean {
  if (!value) {
    return false;
  }

  if (typeof value === 'string') {
    return value === 'fusion' || value === 'steam' || value === 'win-store';
  }

  return value.fusionMode;
}

export function resolveDistributionModeState(
  options: ResolveDistributionModeStateOptions = {},
): DistributionModeState {
  const metadata = options.metadata ?? null;
  const hasBundledRuntime = Boolean(options.hasBundledRuntime);
  const isWindowsStoreRuntime = Boolean(options.isWindowsStoreRuntime);
  const metadataRequestsFusion = metadata?.channel === 'steam'
    || metadata?.channel === 'win-store'
    || (metadata?.mode === 'fusion' && (hasBundledRuntime || isWindowsStoreRuntime));
  const fusionMode = metadataRequestsFusion || hasBundledRuntime;
  const winStoreMode = fusionMode && (
    metadata?.channel === 'win-store'
    || (metadata?.channel !== 'steam' && isWindowsStoreRuntime)
  );
  const steamMode = fusionMode && !winStoreMode && (
    metadata?.channel === 'steam'
    || hasBundledRuntime
  );
  const mode: DistributionMode = steamMode
    ? 'steam'
    : winStoreMode
      ? 'win-store'
      : fusionMode
        ? 'fusion'
        : 'normal';

  return {
    mode,
    fusionMode,
    steamMode,
    winStoreMode,
    activeRuntime: options.activeRuntime ?? null,
    metadata,
  };
}

export const PORTABLE_VERSION_MODE_ERROR =
  'Portable version mode is read-only. Updates and version changes are managed by the packaged distribution.';
