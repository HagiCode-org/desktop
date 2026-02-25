import https from 'https';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import log from 'electron-log';
import type {
  PresetIndex,
  PresetFetchResult,
  ProviderPreset,
  DEFAULT_PRESET_SOURCE,
  ProviderPresetMap,
} from '../types/preset.js';
import { PresetCacheManager } from './preset-cache-manager.js';

/**
 * PresetLoader handles fetching and loading preset configurations
 * Always fetches from remote - no local fallback
 * Priority: cache > remote > empty (show custom only)
 */
export class PresetLoader {
  private cacheManager: PresetCacheManager;
  private bundleData: PresetIndex | null = null;
  private fetchPromise: Promise<PresetFetchResult> | null = null;
  private presetBaseUrl: string;

  constructor(cacheManager: PresetCacheManager) {
    this.cacheManager = cacheManager;
    this.presetBaseUrl = this.getPresetSourceUrl();

    log.info('[PresetLoader] Initialized with base URL:', this.presetBaseUrl);

    // Load bundle data asynchronously
    this.loadBundleData();
  }

  /**
   * Get preset source URL from environment or default
   * @returns Preset source URL
   */
  private getPresetSourceUrl(): string {
    // Check environment variable
    const envUrl = process.env.HAGICODE_PRESETS_BASE_URL;
    if (envUrl) {
      log.info('[PresetLoader] Using preset URL from environment:', envUrl);
      return envUrl;
    }

    // Use default URL
    return 'https://docs.hagicode.com/presets/index.json';
  }

  /**
   * Load internal preset bundle as fallback
   */
  private async loadBundleData(): Promise<void> {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const bundlePath = path.join(path.dirname(__filename), '../assets/presets/bundle.json');

      log.info('[PresetLoader] Loading bundle from:', bundlePath);

      const content = await fs.readFile(bundlePath, 'utf-8');
      this.bundleData = JSON.parse(content) as PresetIndex;

      log.info('[PresetLoader] Bundle loaded successfully');
    } catch (error) {
      log.error('[PresetLoader] Failed to load bundle:', error);
      this.bundleData = null;
    }
  }

  /**
   * Fetch presets with fallback strategy
   * Priority: cache > remote > empty (show custom only)
   * @param forceRefresh Force refresh from remote, ignoring cache
   * @returns Preset fetch result
   */
  async fetchPreset(forceRefresh = false): Promise<PresetFetchResult> {
    // Return existing promise if fetch is in progress (deduplicate concurrent requests)
    if (this.fetchPromise && !forceRefresh) {
      log.info('[PresetLoader] Returning in-flight fetch promise');
      return this.fetchPromise;
    }

    this.fetchPromise = this.doFetchPreset(forceRefresh);

    try {
      const result = await this.fetchPromise;
      return result;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Internal fetch implementation with fallback logic
   */
  private async doFetchPreset(forceRefresh: boolean): Promise<PresetFetchResult> {
    try {
      log.info('[PresetLoader] Fetching presets, forceRefresh:', forceRefresh);

      // Step 1: Check cache if not forcing refresh
      if (!forceRefresh) {
        const cacheValidation = await this.cacheManager.isCacheValid();

        if (cacheValidation.isValid) {
          log.info('[PresetLoader] Using cached presets');
          const cached = await this.cacheManager.getCachedPreset();
          if (cached) {
            return {
              success: true,
              data: cached.presets,
              source: 'cache',
            };
          }
        }
      }

      // Step 2: Fetch from remote
      try {
        const remoteData = await this.fetchFromRemote();

        // Save to cache
        await this.cacheManager.setCachedPreset(remoteData);

        log.info('[PresetLoader] Preset fetched from remote and cached');

        return {
          success: true,
          data: remoteData,
          source: 'remote',
        };
      } catch (remoteError) {
        log.warn('[PresetLoader] Remote fetch failed:', remoteError);

        // Remote failed - return failure so UI shows only custom option
        // Do NOT fall back to bundle or hardcoded - always require remote
        log.error('[PresetLoader] Remote fetch failed, returning empty presets');
        return {
          success: false,
          error: remoteError instanceof Error ? remoteError.message : String(remoteError),
          source: 'fallback',
          data: {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            _version: '1.0',
            types: {
              'claude-code': {
                path: 'claude-code',
                description: 'Claude Code AI 配置预设',
                providers: {},
              },
            },
          },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('[PresetLoader] Fetch failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        source: 'fallback',
        data: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          _version: '1.0',
          types: {
            'claude-code': {
              path: 'claude-code',
              description: 'Claude Code AI 配置预设',
              providers: {},
            },
          },
        },
      };
    }
  }

  /**
   * Fetch presets from remote source via HTTPS
   */
  private async fetchFromRemote(): Promise<PresetIndex> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.presetBaseUrl);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HagiCode-Desktop',
        },
        timeout: 10000, // 10 second timeout
      };

      log.info('[PresetLoader] Fetching from remote:', this.presetBaseUrl);

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              throw new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
            }

            const presets = JSON.parse(data) as PresetIndex;
            resolve(presets);
          } catch (parseError) {
            log.error('[PresetLoader] Failed to parse remote data:', parseError);
            reject(new Error('Invalid preset data format'));
          }
        });
      });

      req.on('error', (error) => {
        log.error('[PresetLoader] Remote request error:', error);
        reject(new Error(`Network error: ${error.message}`));
      });

      req.on('timeout', () => {
        log.error('[PresetLoader] Request timeout');
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Fetch individual provider JSON file from docs site
   * @param relativePath Relative path to provider file (e.g., 'claude-code/providers/anthropic.json')
   * @returns Full provider preset data
   */
  private async fetchProviderFile(relativePath: string): Promise<ProviderPreset> {
    return new Promise((resolve, reject) => {
      const baseUrl = new URL(this.presetBaseUrl);
      const providerUrl = new URL(relativePath, baseUrl.origin + baseUrl.pathname.replace('index.json', ''));

      const options = {
        hostname: providerUrl.hostname,
        port: providerUrl.port || 443,
        path: providerUrl.pathname,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HagiCode-Desktop',
        },
        timeout: 10000,
      };

      log.info('[PresetLoader] Fetching provider from:', providerUrl.href);

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              throw new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
            }

            const providerData = JSON.parse(data) as ProviderPreset;
            resolve(providerData);
          } catch (parseError) {
            log.error('[PresetLoader] Failed to parse provider data:', parseError);
            reject(new Error('Invalid provider data format'));
          }
        });
      });

      req.on('error', (error) => {
        log.error('[PresetLoader] Provider request error:', error);
        reject(new Error(`Network error: ${error.message}`));
      });

      req.on('timeout', () => {
        log.error('[PresetLoader] Provider request timeout');
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Get hardcoded fallback presets
   * Last resort when all other methods fail
   */
  private getHardcodedFallback(): PresetFetchResult {
    const fallback: PresetIndex = {
      version: '1.0.0-fallback',
      lastUpdated: new Date().toISOString(),
      _version: '1.0',
      types: {
        'claude-code': {
          path: 'claude-code',
          description: 'Fallback Claude Code presets',
          providers: {
            anthropic: {
              path: 'claude-code/providers/anthropic.json',
              name: 'Anthropic Official',
              description: '官方 Anthropic API',
              recommended: false,
            },
            zai: {
              path: 'claude-code/providers/zai.json',
              name: '智谱 AI',
              description: '智谱 AI 提供的 Claude API 兼容服务',
              recommended: true,
            },
            aliyun: {
              path: 'claude-code/providers/aliyun.json',
              name: '阿里云 DashScope',
              description: '阿里云灵积平台提供的 Claude API 兼容服务',
              recommended: true,
            },
          },
        },
      },
    };

    return {
      success: true,
      data: fallback,
      source: 'fallback',
    };
  }

  /**
   * Get provider preset by ID
   * Fetches full provider configuration from docs presets
   * @param providerId Provider identifier
   * @returns Provider preset or null if not found
   */
  async getProviderPreset(providerId: string): Promise<ProviderPreset | null> {
    try {
      // Fetch presets if not already loaded
      const result = await this.fetchPreset();

      if (!result.success || !result.data) {
        log.warn('[PresetLoader] No preset data available');
        return null;
      }

      // Find provider in claude-code type
      const claudeCodeType = result.data.types['claude-code'];

      if (!claudeCodeType) {
        log.warn('[PresetLoader] No claude-code preset type found');
        return null;
      }

      // Get index provider info
      const indexProvider = claudeCodeType.providers[providerId];

      if (!indexProvider) {
        log.warn('[PresetLoader] Provider not found:', providerId);
        return null;
      }

      // Try to fetch full provider data from docs site
      try {
        const fullProviderData = await this.fetchProviderFile(indexProvider.path);
        return {
          ...fullProviderData,
          providerId,
        };
      } catch (fetchError) {
        log.warn('[PresetLoader] Failed to fetch provider file, using index data:', fetchError);
        // Fall back to index data with minimal info (continue below)
      }

      // Fallback: Create minimal provider preset from index data
      const providerPreset: ProviderPreset = {
        providerId: indexProvider.path.split('/')[0], // Extract provider ID from path
        name: indexProvider.name,
        description: indexProvider.description,
        apiUrl: {
          codingPlanForAnthropic: '', // Will be filled by ClaudeConfigManager
        },
        recommended: indexProvider.recommended,
        region: 'global', // Default region
        defaultModels: {
          haiku: undefined,
          sonnet: undefined,
          opus: undefined,
        },
      };

      return providerPreset;
    } catch (error) {
      log.error('[PresetLoader] Failed to get provider preset:', error);
      return null;
    }
  }

  /**
   * Get all available providers
   * @returns Map of provider ID to provider info
   */
  async getAvailableProviders(): Promise<ProviderPresetMap> {
    const result = await this.fetchPreset();

    if (!result.success || !result.data) {
      log.warn('[PresetLoader] No preset data available for providers list');
      return {};
    }

    const claudeCodeType = result.data.types['claude-code'];

    if (!claudeCodeType) {
      return {};
    }

    const providers: ProviderPresetMap = {};

    // Convert index providers to full presets
    for (const [providerId, indexProvider] of Object.entries(claudeCodeType.providers)) {
      providers[providerId] = {
        providerId,
        name: indexProvider.name,
        description: indexProvider.description,
        apiUrl: {
          codingPlanForAnthropic: '', // Will be filled by ClaudeConfigManager
        },
        recommended: indexProvider.recommended,
        region: 'global',
        defaultModels: {
          haiku: undefined,
          sonnet: undefined,
          opus: undefined,
        },
      };
    }

    return providers;
  }

  /**
   * Get recommended providers
   * @returns Array of recommended provider presets
   */
  async getRecommendedProviders(): Promise<ProviderPreset[]> {
    const providers = await this.getAvailableProviders();

    return Object.values(providers).filter((p) => p.recommended);
  }

  /**
   * Refresh presets from remote source
   * @returns Preset fetch result
   */
  async refreshPreset(): Promise<PresetFetchResult> {
    log.info('[PresetLoader] Force refreshing presets');

    // Fetch with force flag to bypass cache
    return this.fetchPreset(true);
  }

  /**
   * Get cache statistics
   * @returns Cache stats or null if cache doesn't exist
   */
  async getCacheStats(): Promise<{ sizeBytes: number; sizeMB: number; ageHours: number; exists: boolean } | null> {
    return this.cacheManager.getCacheStats();
  }

  /**
   * Clear preset cache
   * @returns Success status
   */
  async clearCache(): Promise<{ success: boolean; error?: string }> {
    log.info('[PresetLoader] Clearing preset cache');

    return this.cacheManager.clearCache();
  }
}
