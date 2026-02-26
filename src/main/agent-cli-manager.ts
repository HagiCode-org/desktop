import { exec } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log';
import {
  AgentCliType,
  StoredAgentCliSelection,
  CliDetectionResult,
} from '../types/agent-cli.js';

const execAsync = promisify(exec);

/**
 * AgentCliManager manages Agent CLI selection and detection
 * Simplified from ClaudeConfigManager - no API configuration, only CLI type
 */
export class AgentCliManager {
  private static readonly STORE_KEY = 'agentCliSelection';

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
   * Detect if a CLI is available on the system
   * Non-blocking - just checks if command exists
   */
  async detectAvailability(cliType: AgentCliType): Promise<CliDetectionResult> {
    try {
      let command: string;

      switch (cliType) {
        case AgentCliType.ClaudeCode:
          command = 'claude --version';
          break;
        default:
          return { detected: false };
      }

      const { stdout } = await execAsync(command, {
        timeout: 5000,
      });

      // Parse version if available
      const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);

      if (versionMatch) {
        log.info('[AgentCliManager] CLI detected, version:', versionMatch[1]);
        return {
          detected: true,
          version: versionMatch[1],
        };
      }

      return { detected: true };
    } catch (error: any) {
      // Command not found is acceptable - user will configure later
      if (error.message?.includes('not found') || error.code === 'ENOENT') {
        log.info('[AgentCliManager] CLI not found:', cliType);
        return { detected: false };
      }

      // Other errors - still return not detected but log
      log.error('[AgentCliManager] Detection error for', cliType, ':', error);
      return { detected: false };
    }
  }

  /**
   * Get the command name for a CLI type
   */
  getCommandName(cliType: AgentCliType): string {
    switch (cliType) {
      case AgentCliType.ClaudeCode:
        return 'claude';
      default:
        return '';
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
   * Check if user skipped Agent CLI selection
   */
  isSkipped(): boolean {
    const selection = this.loadSelection();
    return selection.isSkipped;
  }
}

export default AgentCliManager;
