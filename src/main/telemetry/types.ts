export type TelemetryEventName =
  | 'error'
  | 'event'
  | 'performance'
  | 'heartbeat';

export interface TelemetryContext {
  appVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  sessionId: string;
}

export interface TelemetryUser {
  id: string;
  anonymous: true;
}

export interface TelemetryEvent {
  name: TelemetryEventName;
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
  reportError(error: unknown, properties?: Record<string, unknown>): Promise<void>;
  track(name: string, properties?: Record<string, unknown>): Promise<void>;
  recordPerformance(name: string, properties?: Record<string, unknown>): Promise<void>;
  identify(id: string): Promise<void>;
  heartbeat(properties?: Record<string, unknown>): Promise<void>;
  getStatus(): ProviderStatus | null;
}
