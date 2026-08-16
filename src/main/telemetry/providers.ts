import type {
  PublicTelemetryConfig,
  TelemetryEvent,
  TelemetryProvider,
  TelemetryRegion,
  TelemetryUser,
  ProviderStatus,
} from './types.js';

type Sender = (event: TelemetryEvent, provider: TelemetryRegion) => Promise<void>;

class ConfiguredProvider implements TelemetryProvider {
  readonly status: ProviderStatus;
  private user: TelemetryUser | null = null;
  constructor(
    readonly region: TelemetryRegion,
    capabilities: readonly TelemetryEvent['name'][],
    private readonly sender: Sender,
  ) {
    this.status = { region, state: 'idle', capabilities: new Set(capabilities) };
  }
  async init(): Promise<void> { this.status.state = 'ready'; }
  async stop(): Promise<void> { this.status.state = 'stopped'; }
  async flush(): Promise<void> {}
  async dispose(): Promise<void> { this.status.state = 'stopped'; this.user = null; }
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

export function createChinaProvider(
  config: PublicTelemetryConfig,
  sender: Sender = noopSender,
): TelemetryProvider {
  return new ConfiguredProvider('cn', ['error', 'event', 'performance', 'heartbeat'], sender);
}

export function createOverseasProvider(
  config: PublicTelemetryConfig,
  sender: Sender = noopSender,
): TelemetryProvider {
  return new ConfiguredProvider('overseas', ['error', 'event', 'performance', 'heartbeat'], sender);
}

export function createProvider(
  region: TelemetryRegion,
  config: PublicTelemetryConfig,
  sender?: Sender,
): TelemetryProvider {
  return region === 'cn' ? createChinaProvider(config, sender) : createOverseasProvider(config, sender);
}
