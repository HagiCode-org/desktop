/**
 * Documentation Links Configuration
 * Centralized storage for all fixed documentation and resource URLs
 */

/**
 * Documentation link categories
 */
export enum LinkCategory {
  AgentCli = 'agent-cli',
  Installation = 'installation',
  Configuration = 'configuration',
  Troubleshooting = 'troubleshooting',
}

/**
 * Documentation link interface
 */
export interface DocLink {
  id: string;
  url: string;
  label: string;
  category: LinkCategory;
}

/**
 * Centralized documentation links registry
 * All fixed URLs should be stored here for easy maintenance
 */
export const DOC_LINKS: Record<string, DocLink> = {
  // Agent CLI Documentation
  claudeCodeSetup: {
    id: 'claude-code-setup',
    url: 'https://docs.hagicode.com/related-software-installation/claude-code/setup-claude-code-with-domestic-providers/',
    label: 'Claude Code Setup Guide',
    category: LinkCategory.AgentCli,
  },
  codexSetup: {
    id: 'codex-setup',
    url: 'https://docs.hagicode.com/related-software-installation/codex/setup-codex/',
    label: 'Codex Setup Guide',
    category: LinkCategory.AgentCli,
  },
  copilotSetup: {
    id: 'copilot-cli-setup',
    url: 'https://docs.github.com/copilot/how-tos/use-copilot-agents/copilot-cli',
    label: 'GitHub Copilot CLI Setup Guide',
    category: LinkCategory.AgentCli,
  },
  opencodeSetup: {
    id: 'opencode-setup',
    url: 'https://opencode.ai/docs/',
    label: 'OpenCode Setup Guide',
    category: LinkCategory.AgentCli,
  },
  qoderSetup: {
    id: 'qoder-setup',
    url: 'https://docs.qoder.com/cli/quick-start',
    label: 'QoderCLI Setup Guide',
    category: LinkCategory.AgentCli,
  },
  kiroSetup: {
    id: 'kiro-setup',
    url: 'https://kiro.dev/docs/cli/installation',
    label: 'Kiro CLI Setup Guide',
    category: LinkCategory.AgentCli,
  },
  kimiSetup: {
    id: 'kimi-setup',
    url: 'https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html',
    label: 'Kimi CLI Setup Guide',
    category: LinkCategory.AgentCli,
  },
  geminiSetup: {
    id: 'gemini-setup',
    url: 'https://google-gemini.github.io/gemini-cli/docs/get-started/',
    label: 'Gemini CLI Setup Guide',
    category: LinkCategory.AgentCli,
  },
  deepagentsSetup: {
    id: 'deepagents-setup',
    url: 'https://docs.langchain.com/oss/python/deepagents/overview',
    label: 'DeepAgents Setup Guide',
    category: LinkCategory.AgentCli,
  },
  hermesSetup: {
    id: 'hermes-setup',
    url: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation/',
    label: 'Hermes Setup Guide',
    category: LinkCategory.AgentCli,
  },

  // Placeholder for future Agent CLIs
  // aiderSetup: {
  //   id: 'aider-setup',
  //   url: 'https://aider.chat/docs/',
  //   label: 'Aider Documentation',
  //   category: LinkCategory.AgentCli,
  // },
};

/**
 * Get documentation link by ID
 */
export function getDocLink(id: string): DocLink | undefined {
  return DOC_LINKS[id];
}

/**
 * Get all links by category
 */
export function getLinksByCategory(category: LinkCategory): DocLink[] {
  return Object.values(DOC_LINKS).filter(link => link.category === category);
}
