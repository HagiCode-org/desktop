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
    url: 'https://docs.hagicode.com/related-software-installation/claude-code/setup-claude-code-with-zai/',
    label: 'Claude Code Setup Guide',
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
