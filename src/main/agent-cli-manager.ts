import log from 'electron-log';
import {
  AgentCliType,
  StoredAgentCliSelection,
} from '../types/agent-cli.js';

/**
 * AgentCliManager manages Agent CLI selection and detection
 * Simplified from ClaudeConfigManager - no API configuration, only CLI type
 */
export class AgentCliManager {
  private static readonly STORE_KEY = 'agentCliSelection';
  private static readonly EXECUTOR_TYPE_MAP: Record<AgentCliType, string> = {
    [AgentCliType.ClaudeCode]: 'ClaudeCodeCli',
    [AgentCliType.Codex]: 'CodexCli',
  };

  constructor(private store: any) {}

  /**
   * Save Agent CLI selection to electron-store
   */
  async saveSelection(cliType: AgentCliType): Promise<void> {
    const selection: StoredAgentCliSelection = {
      cliType,
      isSkipped: false,
      selectedAt: new Date().toISOString(),
    };

    this.store.set(AgentCliManager.STORE_KEY, selection);
    log.info('[AgentCliManager] Saved Agent CLI selection:', cliType);
  }

  /**
   * Store skip flag in electron-store
   */
  async saveSkip(): Promise<void> {
    const selection: StoredAgentCliSelection = {
      cliType: null,
      isSkipped: true,
      selectedAt: new Date().toISOString(),
    };

    this.store.set(AgentCliManager.STORE_KEY, selection);
    log.info('[AgentCliManager] Saved skip flag');
  }

  /**
   * Load stored Agent CLI selection
   */
  loadSelection(): StoredAgentCliSelection {
    return this.store.get(AgentCliManager.STORE_KEY, {
      cliType: null,
      isSkipped: false,
      selectedAt: null,
    });
  }

  /**
   * Get the command name for a CLI type
   */
  getCommandName(cliType: AgentCliType): string {
    switch (cliType) {
      case AgentCliType.ClaudeCode:
        return 'claude';
      case AgentCliType.Codex:
        return 'codex';
      default:
        return 'claude';
    }
  }

  /**
   * Get selected CLI type
   */
  getSelectedCliType(): AgentCliType | null {
    const selection = this.loadSelection();
    return selection.cliType;
  }

  /**
   * Map Agent CLI selection to backend default executor type.
   */
  getExecutorType(cliType: AgentCliType | null): string {
    if (!cliType) {
      return 'ClaudeCodeCli';
    }
    return AgentCliManager.EXECUTOR_TYPE_MAP[cliType] || 'ClaudeCodeCli';
  }

  /**
   * Resolve executor type from current persisted selection.
   */
  getSelectedExecutorType(): string {
    return this.getExecutorType(this.getSelectedCliType());
  }

  /**
   * Check if user skipped Agent CLI selection
   */
  isSkipped(): boolean {
    const selection = this.loadSelection();
    return selection.isSkipped;
  }
}

export default AgentCliManager;
