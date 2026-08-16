import type { PublicTelemetryConfig, TelemetryProvider } from '../types.js';
import { createOverseasProvider } from '../providers.js';

export function createPostHogProvider(config: PublicTelemetryConfig): TelemetryProvider {
  // The Node client is intentionally created only by the main-process adapter.
  return createOverseasProvider(config);
}
