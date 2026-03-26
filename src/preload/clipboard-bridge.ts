import type { ClipboardChannelMap } from '../types/clipboard.js';

export interface ClipboardInvoker {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

export interface ClipboardBridge {
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<void>;
}

export function createClipboardBridge(
  ipcRendererLike: ClipboardInvoker,
  channels: ClipboardChannelMap,
): ClipboardBridge {
  return {
    async readText() {
      return String(await ipcRendererLike.invoke(channels.readText));
    },
    async writeText(text: string) {
      await ipcRendererLike.invoke(channels.writeText, text);
    },
  };
}
