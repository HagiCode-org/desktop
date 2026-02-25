/**
 * Claude Configuration Types
 * Types and interfaces for Claude API configuration management
 */

/**
 * Claude API Provider Type
 */
export type ClaudeProvider = 'anthropic' | 'zai' | 'aliyun' | 'minimax' | 'custom';

/**
 * Claude Configuration Interface
 * Stored in electron-store and used for API validation
 */
export interface ClaudeConfig {
  provider: ClaudeProvider;
  apiKey: string;
  endpoint?: string;
  validatedAt?: string; // ISO timestamp
  lastValidationStatus: 'success' | 'failed';
  cliVersion?: string;
  cliAvailable?: boolean;
  modelHaiku?: string;
  modelSonnet?: string;
  modelOpus?: string;
}

/**
 * Existing Configuration Detection Result
 * Result from scanning environment variables and settings files
 */
export interface DetectedConfig {
  exists: boolean;
  source: 'env' | 'settings' | 'store' | 'none';
  provider?: ClaudeProvider;
  apiKey?: string;
  endpoint?: string;
  cliVersion?: string;
  modelHaiku?: string;
  modelSonnet?: string;
  modelOpus?: string;
}

/**
 * API Validation Result
 * Result from validating API key against provider
 */
export interface ValidationResult {
  success: boolean;
  error?: string;
  models?: string[];
  cliVersion?: string;
}

/**
 * CLI Verification Result
 * Result from checking Claude Code CLI installation
 */
export interface CliVerificationResult {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

/**
 * Claude Configuration State for UI
 * Manages the form state during configuration
 */
export interface ClaudeConfigFormState {
  provider: ClaudeProvider;
  apiKey: string;
  endpoint: string;
  isValidating: boolean;
  isValid: boolean;
  validationError: string | null;
  cliStatus: CliVerificationResult | null;
  showExistingConfig: boolean;
  useExistingConfig: boolean;
  hasChanges: boolean;
  modelHaiku: string;
  modelSonnet: string;
  modelOpus: string;
}

/**
 * Claude Configuration Env Format Settings
 * The correct format for Claude Code CLI settings.json
 */
export interface ClaudeConfigEnvSettings {
  env: {
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_BASE_URL?: string;
    API_TIMEOUT_MS?: string;
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC?: number;
    ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
    ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
  };
  _metadata?: {
    _generated_by: string;
    _generated_at: string; // ISO 8601 timestamp
  };
}

/**
 * Model Mapping Configuration
 * Maps Claude model tiers to provider-specific models
 */
export interface ModelMapping {
  haiku?: string;
  sonnet?: string;
  opus?: string;
}

/**
 * Configuration Source Enum
 * Identifies where a configuration originated from
 */
export enum ConfigSource {
  HagiCodeDesktop = 'hagicode-desktop',
  Manual = 'manual',
  Unknown = 'unknown',
}

/**
 * Backup File Information
 * Details about a configuration backup file
 */
export interface BackupInfo {
  path: string;
  timestamp: Date;
  size: number;
}

/**
 * Configuration Detection Result
 * Extended result from configuration detection including source and metadata
 */
export interface ConfigDetectionResult {
  exists: boolean;
  source: ConfigSource;
  parsedConfig?: ClaudeConfigEnvSettings | Record<string, unknown>;
  modifiedAt?: Date;
}
