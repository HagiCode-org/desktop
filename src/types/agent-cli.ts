/**
 * Agent CLI Types
 * Types and interfaces for Agent CLI selection management
 */

import { getDocLink } from './doc-links.js';

/**
 * Agent CLI type enumeration
 * Extensible for future CLI additions
 */
export enum AgentCliType {
  ClaudeCode = 'claude-code',
  // Future extensions:
  // Aider = 'aider',
  // Cursor = 'cursor-cli',
}

/**
 * Agent CLI configuration interface
 */
export interface AgentCliConfig {
  cliType: AgentCliType;
  displayName: string;
  description: string;
  package: string; // npm package name
  docsLinkId?: string; // Reference to centralized documentation link
  docsUrl?: string; // Computed from docsLinkId
}

/**
 * Available Agent CLI configurations
 * Registry of supported Agent CLIs
 */
export const AGENT_CLI_CONFIGS: Record<AgentCliType, AgentCliConfig> = {
  [AgentCliType.ClaudeCode]: {
    cliType: AgentCliType.ClaudeCode,
    displayName: 'Claude Code',
    description: '官方的 Anthropic Claude 命令行工具',
    package: '@anthropic-ai/claude-code',
    docsLinkId: 'claudeCodeSetup',
  },
};

/**
 * Get Agent CLI config with resolved docsUrl
 * This ensures docsUrl is computed from the centralized docs links
 */
export function getCliConfig(cliType: AgentCliType): AgentCliConfig & { docsUrl?: string } {
  const config = AGENT_CLI_CONFIGS[cliType];
  const docLink = config.docsLinkId ? getDocLink(config.docsLinkId) : undefined;
  return {
    ...config,
    docsUrl: docLink?.url,
  };
}

/**
 * Get all CLI configs with resolved docsUrl
 */
export function getAllCliConfigs(): (AgentCliConfig & { docsUrl?: string })[] {
  return Object.values(AGENT_CLI_CONFIGS).map(config => {
    const docLink = config.docsLinkId ? getDocLink(config.docsLinkId) : undefined;
    return {
      ...config,
      docsUrl: docLink?.url,
    };
  });
}

/**
 * Agent CLI selection stored in electron-store
 */
export interface StoredAgentCliSelection {
  cliType: AgentCliType | null;
  isSkipped: boolean;
  selectedAt: string | null;
}

/**
 * CLI detection result
 */
export interface CliDetectionResult {
  detected: boolean;
  version?: string;
  path?: string;
}
