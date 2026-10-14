import { randomUUID } from 'node:crypto';
import {
  getEventSpec,
  isCatalogEvent,
  type TelemetryCatalogEventName,
  type TelemetryPropertySpec,
  type TelemetrySamplingClass,
} from '../../shared/telemetry-events.js';
import type {
  PublicTelemetryConfig,
  TelemetryContext,
  TelemetryFacade,
  TelemetryProvider,
  TelemetryUser,
  ProviderStatus,
} from './types.js';
import { createTelemetryContext, sanitizeProperties } from './privacy.js';
import { createProvider } from './providers.js';

const MAX_QUEUE = 100;
const telemetryDebugEnabled = process.env.NODE_ENV !== 'production'
  || process.env.HAGICODE_TELEMETRY_DEBUG === '1';

export interface TelemetryManagerOptions {
  config: PublicTelemetryConfig;
  appVersion: string;
  platform?: NodeJS.Platform;
  arch?: string;
  createProvider?: (config: PublicTelemetryConfig) => TelemetryProvider;
  sessionId?: string;
  installId?: string;
  random?: () => number;
}

interface SendOptions {
  sampling: TelemetrySamplingClass;
  eventName?: TelemetryCatalogEventName;
  schema?: Readonly<Record<string, TelemetryPropertySpec>>;
}

export class TelemetryManager implements TelemetryFacade {
  private provider: TelemetryProvider | null = null;
  private readonly queue: Array<Parameters<TelemetryProvider['send']>[0]> = [];
  private readonly context: TelemetryContext;
  private readonly sampledIn: boolean;
  private user: TelemetryUser | undefined;
  private closed = false;

  constructor(private readonly options: TelemetryManagerOptions) {
    this.context = createTelemetryContext({
      appVersion: options.appVersion,
      platform: options.platform ?? process.platform,
      arch: options.arch ?? process.arch,
    }, options.sessionId ?? randomUUID());
    this.user = options.installId ? { id: options.installId, anonymous: true } : undefined;
    this.sampledIn = (options.random ?? Math.random)() < options.config.sampleRate;
  }

  async init(): Promise<void> {
    if (this.closed || !this.options.config.enabled || this.provider) return;
    this.provider = (this.options.createProvider ?? createProvider)(this.options.config);
    try {
      await this.provider.init();
      if (this.user) await this.provider.identify(this.user);
      await this.drain();
    } catch {
      if (telemetryDebugEnabled) {
        console.warn('[Telemetry] provider initialization failed', {
          provider: 'posthog',
        });
      }
      this.provider = null;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.provider?.stop();
    await this.provider?.flush();
    await this.provider?.dispose();
    this.provider = null;
    this.queue.length = 0;
  }

  async reportError(error: unknown, properties?: Record<string, unknown>): Promise<void> {
    await this.send('error', { ...properties, name: error instanceof Error ? error.name : 'UnknownError' }, { sampling: 'session' });
  }
  async track(name: string, properties?: Record<string, unknown>): Promise<void> {
    if (!isCatalogEvent(name)) {
      if (telemetryDebugEnabled) {
        console.info('[Telemetry] event dropped: not in catalog', { provider: 'posthog', event: name });
      }
      return;
    }
    const spec = getEventSpec(name);
    await this.send('event', properties, { sampling: spec.sampling, eventName: name, schema: spec.properties });
  }
  async recordPerformance(name: string, properties?: Record<string, unknown>): Promise<void> {
    await this.send('performance', { ...properties, name }, { sampling: 'session' });
  }
  async identify(id: string): Promise<void> {
    this.user = { id, anonymous: true };
    await this.provider?.identify(this.user);
  }
  async heartbeat(properties?: Record<string, unknown>): Promise<void> {
    await this.send('heartbeat', properties, { sampling: 'session' });
  }
  getStatus(): ProviderStatus | null { return this.provider?.status ?? null; }

  private async send(
    name: Parameters<TelemetryProvider['send']>[0]['name'],
    properties: Record<string, unknown> | undefined,
    options: SendOptions,
  ): Promise<void> {
    const eventLabel = options.eventName ?? `desktop_${name}`;
    if (this.closed) return;
    if (options.sampling === 'session' && !this.sampledIn) {
      if (telemetryDebugEnabled) {
        console.info('[Telemetry] event sampled out', {
          provider: 'posthog',
          event: eventLabel,
          sampleRate: this.options.config.sampleRate,
        });
      }
      return;
    }
    const event = {
      name,
      eventName: options.eventName,
      properties: sanitizeProperties(properties, options.schema),
      context: { ...this.context },
      user: this.user,
      timestamp: Date.now(),
    };
    if (!this.provider || this.provider.status.state !== 'ready') {
      if (this.queue.length >= MAX_QUEUE) this.queue.shift();
      this.queue.push(event);
      if (telemetryDebugEnabled) {
        console.info('[Telemetry] event queued', {
          provider: 'posthog',
          event: eventLabel,
          queueSize: this.queue.length,
        });
      }
      return;
    }
    try { await this.provider.send(event); } catch { /* telemetry never blocks business work */ }
  }

  private async drain(): Promise<void> {
    while (this.queue.length && this.provider?.status.state === 'ready') {
      const event = this.queue.shift();
      if (event) {
        try { await this.provider.send(event); } catch { break; }
      }
    }
  }
}
