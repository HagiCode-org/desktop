import type { PublicTelemetryConfig, TelemetryProvider } from '../types.js';
import { createOverseasProvider } from '../providers.js';

export function createPostHogProvider(config: PublicTelemetryConfig): TelemetryProvider {
  return createOverseasProvider(config);
}
