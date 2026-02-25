/**
 * Claude API Endpoints Configuration
 * Matches Compose Web configuration (repos/docker-compose-builder-web/src/lib/docker-compose/types.ts)
 */

// ZAI (Zhipu AI) API URL constant
// Matches: https://open.bigmodel.cn/api/anthropic from Compose Web
export const ZAI_API_URL = 'https://open.bigmodel.cn/api/anthropic';

// Aliyun DashScope API URL constant
// Matches: https://coding.dashscope.aliyuncs.com/apps/anthropic from Compose Web
export const ALIYUN_API_URL = 'https://coding.dashscope.aliyuncs.com/apps/anthropic';

/**
 * API Endpoint Configuration for each provider
 * Based on Anthropic API Provider Types from Compose Web
 */
export interface ApiEndpointConfig {
  url: string;
  envVar: string;
  description: string;
  requiresEndpoint?: boolean; // Whether ANTHROPIC_URL should be set
}

/**
 * API Endpoints Configuration Object
 * Provider-specific API endpoints and environment variable mappings
 */
export const API_ENDPOINTS: Record<string, ApiEndpointConfig> = {
  anthropic: {
    url: '', // Uses default Anthropic endpoint (https://api.anthropic.com)
    envVar: 'ANTHROPIC_AUTH_TOKEN', // Only set this env var for Anthropic
    description: 'Anthropic Official API - uses default endpoint',
    requiresEndpoint: false,
  },
  zai: {
    url: ZAI_API_URL, // Zhipu AI (ZAI) endpoint
    envVar: 'ANTHROPIC_URL', // Set ANTHROPIC_URL for ZAI
    description: 'Zhipu AI (ZAI) Anthropic-compatible API',
    requiresEndpoint: true,
  },
  aliyun: {
    url: ALIYUN_API_URL, // Aliyun DashScope endpoint
    envVar: 'ANTHROPIC_URL', // Set ANTHROPIC_URL for Aliyun
    description: 'Aliyun DashScope Anthropic-compatible API',
    requiresEndpoint: true,
  },
  custom: {
    url: '', // User-provided endpoint
    envVar: 'ANTHROPIC_URL', // Set ANTHROPIC_URL for custom
    description: 'Custom Anthropic-compatible endpoint',
    requiresEndpoint: true,
  },
};

/**
 * Get API endpoint configuration for a provider
 */
export function getApiEndpointConfig(provider: string): ApiEndpointConfig {
  return API_ENDPOINTS[provider] || API_ENDPOINTS.anthropic;
}

/**
 * Get the API URL for a provider
 */
export function getApiUrl(provider: string): string {
  const config = getApiEndpointConfig(provider);
  return config.url;
}

/**
 * Get the environment variable to set for a provider
 */
export function getEnvVar(provider: string): string {
  const config = getApiEndpointConfig(provider);
  return config.envVar;
}

/**
 * Check if a provider requires setting ANTHROPIC_URL
 */
export function requiresEndpoint(provider: string): boolean {
  const config = getApiEndpointConfig(provider);
  return config.requiresEndpoint || false;
}
