import type { PathDisplayInfo } from './path-display.js';

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
  configuredRoot: PathDisplayInfo;
  effectiveRoot: PathDisplayInfo;
  environmentOverrideActive: boolean;
  environmentOverride: PathDisplayInfo | null;
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
