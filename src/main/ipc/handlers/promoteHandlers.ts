import log from 'electron-log';
import { electron } from '../../../electron-api.js';
import type { PromoteManager } from '../../promote-manager.js';
import {
  promoteChannels,
  type PromoteGetImageResult,
  type PromoteGetItemsResult,
} from '../../../types/promote.js';

const { ipcMain } = electron;

function readStringField(request: unknown, field: string): string | null {
  if (typeof request !== 'object' || request === null) return null;
  const value = (request as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}

export function registerPromoteHandlers(manager: PromoteManager): void {
  ipcMain.handle(promoteChannels.getItems, async (_event, request: unknown): Promise<PromoteGetItemsResult> => {
    const language = readStringField(request, 'language');
    if (language === null) return { items: [] };
    try {
      return { items: await manager.getItems(language) };
    } catch (error) {
      log.warn('[Promote] Failed to load promote items:', error);
      return { items: [] };
    }
  });

  ipcMain.handle(promoteChannels.getImage, async (_event, request: unknown): Promise<PromoteGetImageResult> => {
    const key = readStringField(request, 'key');
    if (key === null) return { dataUrl: null };
    try {
      return { dataUrl: await manager.getImage(key) };
    } catch (error) {
      log.warn('[Promote] Failed to load promote image:', error);
      return { dataUrl: null };
    }
  });
}
