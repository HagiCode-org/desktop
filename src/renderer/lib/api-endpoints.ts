/**
 * Claude API Endpoints Configuration (Renderer)
 * Matches Compose Web configuration (repos/docker-compose-builder-web/src/lib/docker-compose/types.ts)
 */

// ZAI (Zhipu AI) API URL constant
export const ZAI_API_URL = 'https://open.bigmodel.cn/api/anthropic';

// Aliyun DashScope API URL constant
export const ALIYUN_API_URL = 'https://coding.dashscope.aliyuncs.com/apps/anthropic';

// MiniMax API URL constant
export const MINIMAX_API_URL = 'https://api.minimaxi.com/anthropic';

/**
 * API Endpoint Configuration for each provider
 * Based on Anthropic API Provider Types from Compose Web
 */
export interface ApiEndpointConfig {
  url: string;
  envVar: string;
  description: string;
  requiresEndpoint?: boolean;
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
    url: ZAI_API_URL,
    envVar: 'ANTHROPIC_URL',
    description: 'Zhipu AI (ZAI) Anthropic-compatible API',
    requiresEndpoint: true,
  },
  aliyun: {
    url: ALIYUN_API_URL,
    envVar: 'ANTHROPIC_URL',
    description: 'Aliyun DashScope Anthropic-compatible API',
    requiresEndpoint: true,
  },
  minimax: {
    url: MINIMAX_API_URL,
    envVar: 'ANTHROPIC_URL',
    description: 'MiniMax Anthropic-compatible API',
    requiresEndpoint: true,
  },
  custom: {
    url: '',
    envVar: 'ANTHROPIC_URL',
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
 * Get API URL for a provider
 */
export function getApiUrl(provider: string): string {
  const config = getApiEndpointConfig(provider);
  return config.url;
}

/**
 * Check if a provider requires setting ANTHROPIC_URL
 */
export function requiresEndpoint(provider: string): boolean {
  const config = getApiEndpointConfig(provider);
  return config.requiresEndpoint || false;
}

/**
 * Open URL in external browser
 * Uses Electron's openExternal API to open system browser
 */
export async function openInBrowser(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await window.electronAPI.openExternal(url);
  } catch (error) {
    console.error('[openInBrowser] Failed to open URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
