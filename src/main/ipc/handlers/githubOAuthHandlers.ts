import { ipcMain } from 'electron';
import {
  ConfigManager,
  defaultGitHubOAuthConfig,
  normalizeGitHubOAuthConfig,
  validateGitHubOAuthConfig,
  type GitHubOAuthConfig,
} from '../../config.js';
import { PCodeWebServiceManager } from '../../web-service-manager.js';

interface GitHubOAuthHandlerState {
  configManager: ConfigManager | null;
  webServiceManager: PCodeWebServiceManager | null;
}

export interface GitHubOAuthPayload {
  clientId: string;
  clientSecret: string;
}

export interface GitHubOAuthViewModel extends GitHubOAuthConfig {
  isConfigured: boolean;
  requiresRestart: boolean;
}

export interface GitHubOAuthMutationResult {
  success: boolean;
  config: GitHubOAuthViewModel;
  error?: string;
}

const state: GitHubOAuthHandlerState = {
  configManager: null,
  webServiceManager: null,
};

export function initGitHubOAuthHandlers(
  configManager: ConfigManager | null,
  webServiceManager: PCodeWebServiceManager | null
): void {
  state.configManager = configManager;
  state.webServiceManager = webServiceManager;
}

export function registerGitHubOAuthHandlers(deps: GitHubOAuthHandlerState): void {
  state.configManager = deps.configManager;
  state.webServiceManager = deps.webServiceManager;

  ipcMain.handle('github-oauth:get', async () => {
    const config = ensureConfigManager().getGitHubOAuthConfig();
    return buildViewModel(config);
  });

  ipcMain.handle('github-oauth:set', async (_, payload: GitHubOAuthPayload): Promise<GitHubOAuthMutationResult> => {
    try {
      const normalized = normalizeGitHubOAuthConfig(payload);
      const validationError = validateGitHubOAuthPayload(normalized);
      if (validationError) {
        return {
          success: false,
          config: buildViewModel(defaultGitHubOAuthConfig),
          error: validationError,
        };
      }

      const config = ensureConfigManager().setGitHubOAuthConfig({
        ...normalized,
        lastUpdated: new Date().toISOString(),
      });

      return {
        success: true,
        config: buildViewModel(config),
      };
    } catch (error) {
      return {
        success: false,
        config: buildViewModel(defaultGitHubOAuthConfig),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('github-oauth:clear', async (): Promise<GitHubOAuthMutationResult> => {
    try {
      // Clearing credentials is explicit so admins can disable GitHub login cleanly.
      const config = ensureConfigManager().clearGitHubOAuthConfig();
      return {
        success: true,
        config: buildViewModel(config),
      };
    } catch (error) {
      return {
        success: false,
        config: buildViewModel(defaultGitHubOAuthConfig),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export function validateGitHubOAuthPayload(config: GitHubOAuthConfig): string | null {
  return validateGitHubOAuthConfig(config);
}

function ensureConfigManager(): ConfigManager {
  if (!state.configManager) {
    throw new Error('ConfigManager not initialized');
  }

  return state.configManager;
}

function buildViewModel(config: GitHubOAuthConfig): GitHubOAuthViewModel {
  const normalized = normalizeGitHubOAuthConfig(config);
  return {
    ...normalized,
    isConfigured: normalized.clientId.length > 0 && normalized.clientSecret.length > 0,
    requiresRestart: state.webServiceManager?.getGitHubOAuthRuntimeStatus(normalized).requiresRestart ?? false,
  };
}
