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
  Codex = 'codex',
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
  [AgentCliType.Codex]: {
    cliType: AgentCliType.Codex,
    displayName: 'Codex',
    description: 'OpenAI Codex 命令行工具',
    package: '@openai/codex',
    docsLinkId: 'codexSetup',
  },
};

const SUPPORTED_CLI_TYPES = Object.values(AgentCliType) as AgentCliType[];

/**
 * Runtime guard for CLI type values.
 */
export function isAgentCliType(value: unknown): value is AgentCliType {
  return typeof value === 'string' && SUPPORTED_CLI_TYPES.includes(value as AgentCliType);
}

/**
 * Normalize unknown input into supported CLI type.
 */
export function normalizeAgentCliType(value: unknown): AgentCliType | null {
  return isAgentCliType(value) ? value : null;
}

/**
 * Get Agent CLI config with resolved docsUrl
 * This ensures docsUrl is computed from the centralized docs links
 */
export function getCliConfig(cliType: AgentCliType): AgentCliConfig & { docsUrl?: string } {
  const config = AGENT_CLI_CONFIGS[cliType];
  if (!config) {
    throw new Error(`Unsupported Agent CLI type: ${cliType}`);
  }
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
 * Parse persisted selection defensively to avoid unsupported values leaking into runtime.
 */
export function sanitizeStoredAgentCliSelection(value: unknown): StoredAgentCliSelection {
  const candidate = (value ?? {}) as Partial<StoredAgentCliSelection> & { cliType?: unknown };

  const cliType = normalizeAgentCliType(candidate.cliType);
  const isSkipped = Boolean(candidate.isSkipped);
  const selectedAt = typeof candidate.selectedAt === 'string' ? candidate.selectedAt : null;

  return {
    cliType,
    isSkipped: cliType ? false : isSkipped,
    selectedAt,
  };
}
