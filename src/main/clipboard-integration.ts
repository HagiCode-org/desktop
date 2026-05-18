import { electron } from '../electron-api.js';
import type { BrowserWindow, WebContents } from 'electron';
import { buildClipboardContextMenuTemplate } from './clipboard-context-menu.js';
import { clipboardChannels } from '../types/clipboard.js';

const { BrowserWindow: ElectronBrowserWindow, clipboard, ipcMain, Menu: ElectronMenu } = electron;

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

    ElectronMenu.buildFromTemplate(template).popup({
      window: targetContents.hostWebContents
        ? ElectronBrowserWindow.fromWebContents(targetContents.hostWebContents) ?? undefined
        : ElectronBrowserWindow.fromWebContents(targetContents) ?? undefined,
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
