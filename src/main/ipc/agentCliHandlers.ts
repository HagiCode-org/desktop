import { ipcMain } from 'electron';
import type AgentCliManager from '../agent-cli-manager.js';
import type { AgentCliType } from '../../types/agent-cli.js';

/**
 * Register Agent CLI IPC handlers
 */
export function registerAgentCliHandlers(agentCliManager: AgentCliManager): void {
  // Save Agent CLI selection
  ipcMain.handle('agentCli:save', async (_event, { cliType }: { cliType: AgentCliType }) => {
    try {
      await agentCliManager.saveSelection(cliType);
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to save Agent CLI selection:', error);
      return { success: false, error: error.message };
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
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to save Agent CLI skip:', error);
      return { success: false, error: error.message };
    }
  });

  // Detect CLI availability
  ipcMain.handle('agentCli:detect', async (_event, cliType: AgentCliType) => {
    try {
      return await agentCliManager.detectAvailability(cliType);
    } catch (error: any) {
      console.error('[IPC] Failed to detect CLI availability:', error);
      return { detected: false };
    }
  });

  // Get command name for CLI type
  ipcMain.handle('agentCli:getCommand', (_event, cliType: AgentCliType) => {
    try {
      return agentCliManager.getCommandName(cliType);
    } catch (error: any) {
      console.error('[IPC] Failed to get command name:', error);
      return '';
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
