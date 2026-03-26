import {
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  type WebContents,
} from 'electron';
import { buildClipboardContextMenuTemplate } from './clipboard-context-menu.js';
import { clipboardChannels } from '../types/clipboard.js';

let clipboardHandlersRegistered = false;
const wiredWebContentsIds = new Set<number>();

function attachContextMenuHandler(targetContents: WebContents): void {
  if (wiredWebContentsIds.has(targetContents.id)) {
    return;
  }

  wiredWebContentsIds.add(targetContents.id);
  targetContents.once('destroyed', () => {
    wiredWebContentsIds.delete(targetContents.id);
  });

  targetContents.on('context-menu', (_event, params) => {
    const template = buildClipboardContextMenuTemplate(params, clipboard.readText().length > 0);

    if (template.length === 0) {
      return;
    }

    Menu.buildFromTemplate(template).popup({
      window: targetContents.hostWebContents
        ? BrowserWindow.fromWebContents(targetContents.hostWebContents) ?? undefined
        : BrowserWindow.fromWebContents(targetContents) ?? undefined,
    });
  });
}

export function wireDesktopWindowClipboard(targetWindow: BrowserWindow): void {
  attachContextMenuHandler(targetWindow.webContents);

  targetWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    attachContextMenuHandler(webContents);
  });
}

export function registerClipboardHandlers(): void {
  if (clipboardHandlersRegistered) {
    return;
  }

  ipcMain.handle(clipboardChannels.readText, () => clipboard.readText());
  ipcMain.handle(clipboardChannels.writeText, (_event, text: string) => {
    clipboard.writeText(text ?? '');
  });

  clipboardHandlersRegistered = true;
}
