import type {
  PublicTelemetryConfig,
  TelemetryEvent,
  TelemetryProvider,
  TelemetryUser,
  ProviderStatus,
} from './types.js';
import { PostHog } from 'posthog-node';

type Sender = (event: TelemetryEvent) => Promise<void>;

const telemetryDebugEnabled = process.env.NODE_ENV !== 'production'
  || process.env.HAGICODE_TELEMETRY_DEBUG === '1';

function debug(message: string, details?: Record<string, unknown>): void {
  if (telemetryDebugEnabled) {
    console.info(`[Telemetry] ${message}`, details ?? '');
  }
}

class ConfiguredProvider implements TelemetryProvider {
  readonly status: ProviderStatus;
  private user: TelemetryUser | null = null;
  private readonly onInit?: () => void | Promise<void>;
  private readonly onDispose?: () => Promise<void>;
  constructor(
    capabilities: readonly TelemetryEvent['name'][],
    private readonly sender: Sender,
    lifecycle: { onInit?: () => void; onDispose?: () => Promise<void> } = {},
  ) {
    this.onInit = lifecycle.onInit;
    this.onDispose = lifecycle.onDispose;
    this.status = { state: 'idle', capabilities: new Set(capabilities) };
  }
  async init(): Promise<void> {
    debug('PostHog initializing');
    await this.onInit?.();
    this.status.state = 'ready';
    debug('PostHog ready');
  }
  async stop(): Promise<void> {
    this.status.state = 'stopped';
    debug('PostHog stopped');
  }
  async flush(): Promise<void> {
    debug('PostHog flushing');
  }
  async dispose(): Promise<void> {
    await this.onDispose?.();
    this.status.state = 'stopped';
    this.user = null;
    debug('PostHog disposed');
  }
  async identify(user: TelemetryUser): Promise<void> { this.user = user; }
  async send(event: TelemetryEvent): Promise<void> {
    if (this.status.state !== 'ready') throw new Error('PostHog provider is not ready');
    try {
      await this.sender({ ...event, user: event.user ?? this.user ?? undefined });
      debug('event submitted', { provider: 'posthog', event: eventName(event) });
    } catch (error) {
      this.status.state = 'failed';
      this.status.lastError = error instanceof Error ? error.message : String(error);
      debug('event submission failed', {
        provider: 'posthog',
        event: eventName(event),
        error: this.status.lastError,
      });
      throw error;
    }
  }
}

const noopSender: Sender = async () => {};

function eventName(event: TelemetryEvent): string {
  return event.name === 'event' ? String(event.properties?.name ?? 'desktop_event') : `desktop_${event.name}`;
}

function createOverseasSender(config: PublicTelemetryConfig): {
  sender: Sender;
  onInit: () => Promise<void>;
  onDispose: () => Promise<void>;
} {
  const posthog = config.posthog ? new PostHog(config.posthog.apiKey, {
    host: config.posthog.host,
    flushAt: 1,
    flushInterval: 1000,
  }) : null;
  return {
    onInit: async () => {
      debug('PostHog connection configured', {
        provider: 'overseas',
        host: config.posthog?.host,
      });
    },
    sender: async (event) => {
      const distinctId = event.user?.id ?? event.context.sessionId;
      posthog?.capture({
        distinctId,
        event: eventName(event),
        properties: { ...event.context, ...event.properties },
      });
    },
    onDispose: async () => {
      await posthog?.shutdown(2000);
    },
  };
}

export function createOverseasProvider(
  config: PublicTelemetryConfig,
  sender?: Sender,
): TelemetryProvider {
  const sdk = createOverseasSender(config);
  return new ConfiguredProvider(
    ['error', 'event', 'performance', 'heartbeat'],
    sender ?? sdk.sender,
    sender ? {} : sdk,
  );
}

export function createProvider(
  config: PublicTelemetryConfig,
  sender?: Sender,
): TelemetryProvider {
  return createOverseasProvider(config, sender);
}
