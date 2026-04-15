export interface ManagedWebTelemetrySettings {
  enabled: boolean;
  enableTracing: boolean;
  enableMetrics: boolean;
  endpoint: string;
}

export type ManagedWebTelemetrySyncState = 'local-only' | 'synced' | 'partial';

export interface ManagedWebTelemetrySyncStatus {
  state: ManagedWebTelemetrySyncState;
  installedVersionIds: string[];
  syncedVersionIds: string[];
  unsyncedVersionIds: string[];
}

export interface ManagedWebTelemetryWarning {
  code: 'partial-sync';
  failedVersionIds: string[];
}

export interface ManagedWebTelemetryPayload {
  settings: ManagedWebTelemetrySettings;
  status: ManagedWebTelemetrySyncStatus;
  warning: ManagedWebTelemetryWarning | null;
  applyMode: 'restart-required';
}

export type ManagedWebTelemetrySettingsInput = Partial<ManagedWebTelemetrySettings>;

export interface ManagedWebTelemetryBridge {
  get: () => Promise<ManagedWebTelemetryPayload>;
  set: (settings: ManagedWebTelemetrySettingsInput) => Promise<ManagedWebTelemetryPayload>;
}
