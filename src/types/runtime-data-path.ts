export const runtimeDataPathPresets = [
  'userData-runtime-data',
  'home-runtime-data',
] as const;

export type RuntimeDataPathPreset = (typeof runtimeDataPathPresets)[number];

export const runtimeDataPathChannels = {
  get: 'runtime-data-path:get',
  set: 'runtime-data-path:set',
} as const;

export type RuntimeDataPathSaveStatus = 'unchanged' | 'restarted' | 'failed';

export interface RuntimeDataPathSettingsSnapshot {
  configuredPreset: RuntimeDataPathPreset;
  effectivePreset: RuntimeDataPathPreset;
  configuredRootPath: string;
  effectiveRootPath: string;
  environmentOverrideActive: boolean;
  environmentOverrideRoot: string | null;
  lockedByRuntime: boolean;
  readOnlyReason?: string;
}

export interface RuntimeDataPathSaveResult {
  status: RuntimeDataPathSaveStatus;
  previousPreset: RuntimeDataPathPreset;
  nextPreset: RuntimeDataPathPreset;
  restartAttempted: boolean;
  restartCompleted: boolean;
  settings: RuntimeDataPathSettingsSnapshot;
  error?: string;
}

export interface RuntimeDataPathBridge {
  getSettings: () => Promise<RuntimeDataPathSettingsSnapshot>;
  setPreset: (preset: RuntimeDataPathPreset) => Promise<RuntimeDataPathSaveResult>;
}
