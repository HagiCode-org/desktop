import type { TelemetryCatalogEventName } from '../../shared/telemetry-events.js';
import type { DesktopLanguageCode } from '../../shared/desktop-languages.js';
import type { DistributionMode } from '../../types/distribution-mode.js';
import type { ServiceRegion } from '../../types/service-region.js';

/** Every event leaving telemetry is a catalogued event; there is no untyped channel. */
export type TelemetryEventName = 'event';

/** Coarse, enumerated dimensions attached to every event at send time. */
export interface TelemetryDimensions {
  distribution: DistributionMode;
  serviceRegion: ServiceRegion;
  language: DesktopLanguageCode;
}

export interface TelemetryContext extends Partial<TelemetryDimensions> {
  appVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  sessionId: string;
}

export interface TelemetrySampling {
  sampled: boolean;
  sampleRate: number;
}

export interface TelemetryUser {
  id: string;
  anonymous: true;
}

export interface TelemetryEvent {
  name: TelemetryEventName;
  eventName?: TelemetryCatalogEventName;
  properties?: Record<string, unknown>;
  context: TelemetryContext;
  user?: TelemetryUser;
  timestamp: number;
}

export interface PublicTelemetryConfig {
  enabled: boolean;
  sampleRate: number;
  sessionReplay: boolean;
  posthog: {
    apiKey: string;
    host: string;
    uiHost: string;
    projectId: string;
    defaults: string;
    personProfiles: 'identified_only' | 'always';
  };
}

export type ProviderState = 'idle' | 'initializing' | 'ready' | 'failed' | 'stopped';

export interface ProviderStatus {
  state: ProviderState;
  capabilities: ReadonlySet<TelemetryEventName>;
  lastError?: string;
}

export interface TelemetryProvider {
  readonly status: ProviderStatus;
  init(): Promise<void>;
  stop(): Promise<void>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
  send(event: TelemetryEvent): Promise<void>;
  identify(user: TelemetryUser): Promise<void>;
}

export interface TelemetryFacade {
  init(): Promise<void>;
  close(): Promise<void>;
  flush(timeoutMs: number): Promise<void>;
  track(name: string, properties?: Record<string, unknown>): Promise<void>;
  identify(id: string): Promise<void>;
  getSampling(): TelemetrySampling;
  getStatus(): ProviderStatus | null;
}
