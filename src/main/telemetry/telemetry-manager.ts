import { randomUUID } from 'node:crypto';
import type {
  PublicTelemetryConfig,
  TelemetryContext,
  TelemetryFacade,
  TelemetryProvider,
  TelemetryRegion,
  TelemetryUser,
  ProviderStatus,
} from './types.js';
import { createTelemetryContext, sanitizeProperties } from './privacy.js';
import { createProvider } from './providers.js';

const MAX_QUEUE = 100;

export interface TelemetryManagerOptions {
  config: PublicTelemetryConfig;
  appVersion: string;
  platform?: NodeJS.Platform;
  arch?: string;
  createProvider?: (region: TelemetryRegion, config: PublicTelemetryConfig) => TelemetryProvider;
  sessionId?: string;
}

export class TelemetryManager implements TelemetryFacade {
  private provider: TelemetryProvider | null = null;
  private currentRegion: TelemetryRegion;
  private readonly queue: Array<Parameters<TelemetryProvider['send']>[0]> = [];
  private readonly context: TelemetryContext;
  private user: TelemetryUser | undefined;
  private closed = false;

  constructor(private readonly options: TelemetryManagerOptions) {
    this.currentRegion = options.config.defaultRegion;
    this.context = createTelemetryContext({
      appVersion: options.appVersion,
      platform: options.platform ?? process.platform,
      arch: options.arch ?? process.arch,
      region: this.currentRegion,
    }, options.sessionId ?? randomUUID());
  }

  async init(): Promise<void> {
    if (this.closed || !this.options.config.enabled || this.provider) return;
    this.provider = (this.options.createProvider ?? createProvider)(this.currentRegion, this.options.config);
    try {
      await this.provider.init();
      await this.drain();
    } catch {
      this.provider = null;
    }
  }

  async switchRegion(region: TelemetryRegion): Promise<void> {
    if (region === this.currentRegion && this.provider) return;
    await this.provider?.stop();
    await this.provider?.flush();
    await this.provider?.dispose();
    this.provider = null;
    this.currentRegion = region;
    this.context.region = region;
    if (!this.closed) await this.init();
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
    await this.send('error', { ...properties, name: error instanceof Error ? error.name : 'UnknownError' });
  }
  async track(name: string, properties?: Record<string, unknown>): Promise<void> {
    await this.send('event', { ...properties, name });
  }
  async recordPerformance(name: string, properties?: Record<string, unknown>): Promise<void> {
    await this.send('performance', { ...properties, name });
  }
  async identify(id: string): Promise<void> {
    this.user = { id, anonymous: true };
    await this.provider?.identify(this.user);
  }
  async heartbeat(properties?: Record<string, unknown>): Promise<void> {
    await this.send('heartbeat', properties);
  }
  getStatus(): ProviderStatus | null { return this.provider?.status ?? null; }

  private async send(name: Parameters<TelemetryProvider['send']>[0]['name'], properties?: Record<string, unknown>): Promise<void> {
    if (this.closed || Math.random() > this.options.config.sampleRate) return;
    const event = {
      name,
      properties: sanitizeProperties(properties),
      context: { ...this.context },
      user: this.user,
      timestamp: Date.now(),
    };
    if (!this.provider || this.provider.status.state !== 'ready') {
      if (this.queue.length >= MAX_QUEUE) this.queue.shift();
      this.queue.push(event);
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
