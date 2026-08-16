import type { PublicTelemetryConfig, TelemetryProvider } from '../types.js';
import { createChinaProvider } from '../providers.js';

export function createCloudcareProvider(config: PublicTelemetryConfig): TelemetryProvider {
  return createChinaProvider(config);
}
