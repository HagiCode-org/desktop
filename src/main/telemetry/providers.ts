import type {
  PublicTelemetryConfig,
  TelemetryEvent,
  TelemetryProvider,
  TelemetryRegion,
  TelemetryUser,
  ProviderStatus,
} from './types.js';
import { PostHog } from 'posthog-node';

type Sender = (event: TelemetryEvent, provider: TelemetryRegion) => Promise<void>;

class ConfiguredProvider implements TelemetryProvider {
  readonly status: ProviderStatus;
  private user: TelemetryUser | null = null;
  private readonly onInit?: () => void | Promise<void>;
  private readonly onDispose?: () => Promise<void>;
  constructor(
    readonly region: TelemetryRegion,
    capabilities: readonly TelemetryEvent['name'][],
    private readonly sender: Sender,
    lifecycle: { onInit?: () => void; onDispose?: () => Promise<void> } = {},
  ) {
    this.onInit = lifecycle.onInit;
    this.onDispose = lifecycle.onDispose;
    this.status = { region, state: 'idle', capabilities: new Set(capabilities) };
  }
  async init(): Promise<void> { await this.onInit?.(); this.status.state = 'ready'; }
  async stop(): Promise<void> { this.status.state = 'stopped'; }
  async flush(): Promise<void> {}
  async dispose(): Promise<void> {
    await this.onDispose?.();
    this.status.state = 'stopped';
    this.user = null;
  }
  async identify(user: TelemetryUser): Promise<void> { this.user = user; }
  async send(event: TelemetryEvent): Promise<void> {
    if (this.status.state !== 'ready') throw new Error(`Provider ${this.region} is not ready`);
    try {
      await this.sender({ ...event, user: event.user ?? this.user ?? undefined }, this.region);
    } catch (error) {
      this.status.state = 'failed';
      this.status.lastError = error instanceof Error ? error.message : String(error);
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
  let sentry: typeof import('@sentry/electron/main') | null = null;
  return {
    onInit: async () => {
      if (config.sentry?.dsn) {
        sentry = await import('@sentry/electron/main');
        sentry.init({ dsn: config.sentry.dsn, tracesSampleRate: config.sampleRate });
      }
    },
    sender: async (event) => {
      const distinctId = event.user?.id ?? event.context.sessionId;
      posthog?.capture({
        distinctId,
        event: eventName(event),
        properties: { ...event.context, ...event.properties },
      });
      if (event.name === 'error') sentry?.captureMessage(eventName(event), { level: 'error', extra: event.properties });
      else sentry?.addBreadcrumb({ category: 'telemetry', message: eventName(event), data: event.properties });
    },
    onDispose: async () => {
      await posthog?.shutdown(2000);
      await sentry?.flush(2000);
      sentry?.close(2000);
    },
  };
}

export function createChinaProvider(
  config: PublicTelemetryConfig,
  sender: Sender = noopSender,
): TelemetryProvider {
  return new ConfiguredProvider('cn', ['error', 'event', 'performance', 'heartbeat'], sender);
}

export function createOverseasProvider(
  config: PublicTelemetryConfig,
  sender?: Sender,
): TelemetryProvider {
  const sdk = createOverseasSender(config);
  return new ConfiguredProvider(
    'overseas',
    ['error', 'event', 'performance', 'heartbeat'],
    sender ?? sdk.sender,
    sender ? {} : sdk,
  );
}

export function createProvider(
  region: TelemetryRegion,
  config: PublicTelemetryConfig,
  sender?: Sender,
): TelemetryProvider {
  return region === 'cn' ? createChinaProvider(config, sender) : createOverseasProvider(config, sender);
}
