export interface DebugOptionsSettings {
  useIgnoreScriptsForManagedNpm: boolean;
}

export type DebugOptionsSaveStatus = 'unchanged' | 'saved' | 'failed';

export interface DebugOptionsSettingsSnapshot extends DebugOptionsSettings {}

export interface DebugOptionsSaveResult {
  status: DebugOptionsSaveStatus;
  previousSettings: DebugOptionsSettings;
  nextSettings: DebugOptionsSettings;
  restartAttempted: boolean;
  restartCompleted: boolean;
  settings: DebugOptionsSettingsSnapshot;
  error?: string;
}

export interface DebugOptionsBridge {
  getSettings: () => Promise<DebugOptionsSettingsSnapshot>;
  setSettings: (settings: DebugOptionsSettings) => Promise<DebugOptionsSaveResult>;
}

export const debugOptionsChannels = {
  get: 'debug-options:get',
  set: 'debug-options:set',
} as const;
