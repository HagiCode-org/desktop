import type { EmbeddedNodeRuntimeConsumerDefaultMatrix } from './embedded-node-runtime-config.js';

export const DESKTOP_BUNDLED_NODE_CONSUMER = 'desktop';
export const BUNDLED_NODE_DESKTOP_OVERRIDE_ENV = 'HAGICODE_BUNDLED_NODE_ENABLED';

export type BundledNodeRuntimePolicySource = 'override' | 'manifest-default' | 'legacy-fallback';

export interface BundledNodeRuntimePolicyInput {
  consumer?: string;
  defaultEnabledByConsumer?: EmbeddedNodeRuntimeConsumerDefaultMatrix | null;
  explicitEnabled?: boolean | null;
  legacyFallbackEnabled?: boolean;
}

export interface BundledNodeRuntimePolicyDecision {
  consumer: string;
  enabled: boolean;
  source: BundledNodeRuntimePolicySource;
  explicitEnabled: boolean | null;
  manifestDefault: boolean | null;
  legacyFallbackEnabled: boolean;
}

export function parseBundledNodeRuntimeOverride(value: string | undefined | null): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
    return false;
  }

  return null;
}

export function resolveBundledNodeRuntimePolicy(
  input: BundledNodeRuntimePolicyInput = {},
): BundledNodeRuntimePolicyDecision {
  const consumer = input.consumer ?? DESKTOP_BUNDLED_NODE_CONSUMER;
  const legacyFallbackEnabled = input.legacyFallbackEnabled ?? true;
  const explicitEnabled = input.explicitEnabled ?? null;
  const manifestDefault = input.defaultEnabledByConsumer?.[consumer] ?? null;

  if (explicitEnabled !== null) {
    return {
      consumer,
      enabled: explicitEnabled,
      source: 'override',
      explicitEnabled,
      manifestDefault,
      legacyFallbackEnabled,
    };
  }

  if (manifestDefault !== null) {
    return {
      consumer,
      enabled: manifestDefault,
      source: 'manifest-default',
      explicitEnabled,
      manifestDefault,
      legacyFallbackEnabled,
    };
  }

  return {
    consumer,
    enabled: legacyFallbackEnabled,
    source: 'legacy-fallback',
    explicitEnabled,
    manifestDefault,
    legacyFallbackEnabled,
  };
}

export function resolveDesktopBundledNodeRuntimePolicyFromEnv(
  defaultEnabledByConsumer?: EmbeddedNodeRuntimeConsumerDefaultMatrix | null,
  env: NodeJS.ProcessEnv = process.env,
): BundledNodeRuntimePolicyDecision {
  return resolveBundledNodeRuntimePolicy({
    consumer: DESKTOP_BUNDLED_NODE_CONSUMER,
    defaultEnabledByConsumer,
    explicitEnabled: parseBundledNodeRuntimeOverride(env[BUNDLED_NODE_DESKTOP_OVERRIDE_ENV]),
    legacyFallbackEnabled: true,
  });
}
