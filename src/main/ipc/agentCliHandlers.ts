import { ipcMain } from 'electron';
import type AgentCliManager from '../agent-cli-manager.js';
import { isAgentCliType, type AgentCliType } from '../../types/agent-cli.js';

interface AgentCliHandlerDeps {
  onSelectionSaved?: (cliType: AgentCliType) => Promise<void> | void;
  onSkipped?: () => Promise<void> | void;
}

/**
 * Register Agent CLI IPC handlers
 */
export function registerAgentCliHandlers(
  agentCliManager: AgentCliManager,
  deps: AgentCliHandlerDeps = {}
): void {
  // Save Agent CLI selection
  ipcMain.handle('agentCli:save', async (_event, { cliType }: { cliType: AgentCliType }) => {
    try {
      if (!isAgentCliType(cliType)) {
        return { success: false, errorCode: 'INVALID_ARGUMENT', error: `Unsupported cliType: ${String(cliType)}` };
      }
      await agentCliManager.saveSelection(cliType);
      await deps.onSelectionSaved?.(cliType);
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to save Agent CLI selection:', error);
      return { success: false, errorCode: 'EXECUTION_FAILED', error: error.message };
    }
  });

  // Load Agent CLI selection
  ipcMain.handle('agentCli:load', () => {
    try {
      return agentCliManager.loadSelection();
    } catch (error: any) {
      console.error('[IPC] Failed to load Agent CLI selection:', error);
      return { cliType: null, isSkipped: false, selectedAt: null };
    }
  });

  // Save skip flag
  ipcMain.handle('agentCli:skip', async () => {
    try {
      await agentCliManager.saveSkip();
      await deps.onSkipped?.();
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to save Agent CLI skip:', error);
      return { success: false, errorCode: 'EXECUTION_FAILED', error: error.message };
    }
  });

  // Get selected CLI type
  ipcMain.handle('agentCli:getSelected', () => {
    try {
      return agentCliManager.getSelectedCliType();
    } catch (error: any) {
      console.error('[IPC] Failed to get selected CLI type:', error);
      return null;
    }
  });

  console.log('[IPC] Agent CLI handlers registered');
}
