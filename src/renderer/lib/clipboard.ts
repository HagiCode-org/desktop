interface BrowserClipboardLike {
  writeText?: (text: string) => Promise<void>;
}

interface DesktopClipboardBridge {
  writeText?: (text: string) => Promise<void>;
}

function getBrowserClipboard(): BrowserClipboardLike | null {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return null;
  }

  return navigator.clipboard;
}

function getDesktopClipboardBridge(): DesktopClipboardBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const electronAPI = (window as Window & {
    electronAPI?: {
      clipboard?: DesktopClipboardBridge;
    };
  }).electronAPI;

  return electronAPI?.clipboard ?? null;
}

export async function writeTextToClipboard(text: string): Promise<void> {
  const browserClipboard = getBrowserClipboard();
  let browserError: unknown;

  if (browserClipboard?.writeText) {
    try {
      await browserClipboard.writeText(text);
      return;
    } catch (error) {
      browserError = error;
    }
  }

  const desktopClipboard = getDesktopClipboardBridge();
  if (desktopClipboard?.writeText) {
    await desktopClipboard.writeText(text);
    return;
  }

  if (browserError instanceof Error) {
    throw browserError;
  }

  throw new Error('Clipboard is unavailable in this desktop surface');
}
