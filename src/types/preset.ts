/**
 * Preset Configuration Types
 * Types and interfaces for provider preset configuration management
 */

/**
 * Model Mapping Configuration
 * Maps Claude model tiers to provider-specific model names
 */
export interface ModelMapping {
  haiku?: string;
  sonnet?: string;
  opus?: string;
}

/**
 * Provider Preset Configuration
 * Single provider preset loaded from docs repository
 */
export interface ProviderPreset {
  providerId: string;
  name: string;
  description: string;
  category?: string;
  apiUrl: Record<string, string>;
  recommended: boolean;
  region: string;
  defaultModels: ModelMapping;
  supportedModels?: string[];
  features?: string[];
  authTokenEnv?: string;
  referralUrl?: string;
  documentationUrl?: string;
  notes?: string;
}

/**
 * Preset Index Structure (from docs/index.json)
 * Top-level index for all presets
 */
export interface PresetIndex {
  version: string;
  lastUpdated: string;
  _version?: string;
  types: {
    [typeKey: string]: {
      path: string;
      description: string;
      providers: {
        [providerId: string]: {
          path: string;
          name: string;
          description: string;
          recommended: boolean;
        };
      };
    };
  };
}

/**
 * Cached Preset Data
 * Includes preset data with caching metadata
 */
export interface PresetCacheData {
  presets: PresetIndex;
  timestamp: number;
  version: string;
  validUntil: number;
}

/**
 * Preset Loading State
 * Represents the current state of preset loading
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Preset Fetch Result
 * Result from fetching presets from remote source
 */
export interface PresetFetchResult {
  success: boolean;
  data?: PresetIndex;
  error?: string;
  source: 'cache' | 'remote' | 'bundle' | 'fallback';
}

/**
 * Provider Preset Cache Entry
 * Individual provider preset with full configuration
 */
export interface ProviderPresetCacheEntry extends ProviderPreset {
  loadedAt: number;
  source: 'remote' | 'bundle' | 'fallback';
}

/**
 * Cache Validation Result
 * Result from validating cache freshness
 */
export interface CacheValidationResult {
  isValid: boolean;
  isExpired: boolean;
  ageMs: number;
  timestamp?: number;
}

/**
 * Preset Service Error
 * Error details from preset service operations
 */
export interface PresetServiceError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Preset Source Configuration
 * Configuration for preset source URLs
 */
export interface PresetSourceConfig {
  baseUrl: string;
  fallbackEnabled: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}

/**
 * Default preset source configurations
 */
export const DEFAULT_PRESET_SOURCE: PresetSourceConfig = {
  baseUrl: 'https://docs.hagicode.com/presets/index.json',
  fallbackEnabled: true,
  cacheEnabled: true,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Cache constants
 */
export const CACHE_FILENAME = 'presets-cache.json';
export const CACHE_MAX_SIZE_MB = 5;

/**
 * Re-export PresetLoader for main process
 */
export { PresetLoader } from '../services/preset-loader.js';

/**
 * Re-export PresetCacheManager for main process
 */
export { PresetCacheManager } from '../services/preset-cache-manager.js';

/**
 * Provider region types
 */
export type ProviderRegion = 'cn' | 'us' | 'eu' | 'global';

/**
 * Category types
 */
export type ProviderCategory = 'official' | 'china-providers' | 'custom';

/**
 * Feature flags
 */
export type ProviderFeature = 'experimental-agent-teams' | 'streaming' | 'function-calling';

/**
 * Helper type for provider ID to preset mapping
 */
export type ProviderPresetMap = Record<string, ProviderPreset>;

/**
 * Validate provider preset has required fields
 */
export function isValidProviderPreset(preset: unknown): preset is ProviderPreset {
  if (!preset || typeof preset !== 'object') {
    return false;
  }

  const p = preset as Record<string, unknown>;

  return (
    typeof p.providerId === 'string' &&
    typeof p.name === 'string' &&
    typeof p.description === 'string' &&
    typeof p.apiUrl === 'object' &&
    typeof p.recommended === 'boolean' &&
    typeof p.region === 'string' &&
    typeof p.defaultModels === 'object'
  );
}

/**
 * Validate preset index structure
 */
export function isValidPresetIndex(index: unknown): index is PresetIndex {
  if (!index || typeof index !== 'object') {
    return false;
  }

  const i = index as Record<string, unknown>;

  return (
    typeof i.version === 'string' &&
    typeof i.lastUpdated === 'string' &&
    typeof i.types === 'object'
  );
}
