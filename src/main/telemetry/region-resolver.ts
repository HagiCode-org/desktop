import type { TelemetryRegion } from './types.js';

export interface RegionCache {
  get(): TelemetryRegion | null;
  set(region: TelemetryRegion): void;
}

export class MemoryRegionCache implements RegionCache {
  private value: TelemetryRegion | null = null;
  get(): TelemetryRegion | null { return this.value; }
  set(region: TelemetryRegion): void { this.value = region; }
}

export class StoreRegionCache implements RegionCache {
  constructor(
    private readonly store: { get<T>(key: string): T | undefined; set(key: string, value: unknown): void },
    private readonly key = 'cloudTelemetry.region',
  ) {}
  get(): TelemetryRegion | null {
    const value = this.store.get<string>(this.key);
    return value === 'cn' || value === 'overseas' ? value : null;
  }
  set(region: TelemetryRegion): void { this.store.set(this.key, region); }
}

export interface RegionResolverOptions {
  defaultRegion: TelemetryRegion;
  detectionUrl: string;
  cache?: RegionCache;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class RegionResolver {
  private readonly options: Required<Pick<RegionResolverOptions, 'timeoutMs' | 'fetcher'>>;
  constructor(private readonly config: RegionResolverOptions) {
    this.options = {
      timeoutMs: config.timeoutMs ?? 2500,
      fetcher: config.fetcher ?? fetch,
    };
  }

  initial(): TelemetryRegion {
    return this.config.cache?.get() ?? this.config.defaultRegion;
  }

  async detect(): Promise<TelemetryRegion | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.options.fetcher(this.config.detectionUrl, { signal: controller.signal });
      if (!response.ok) return null;
      const body = await response.json() as { region?: unknown };
      const result = body.region === 'cn' || body.region === 'overseas' ? body.region : null;
      if (result) this.config.cache?.set(result);
      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
