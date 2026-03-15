export const HAGICODE_CACHE_BYPASS_PARAM = 'hc_desktop_ts';

export interface HagicodeWindowLike {
  once(event: 'ready-to-show', listener: () => void): void;
  maximize(): void;
  show(): void;
  focus(): void;
  loadURL(url: string): Promise<unknown>;
  webContents: {
    on(
      event: 'did-fail-load',
      listener: (event: unknown, errorCode: number, errorDescription: string) => void,
    ): void;
  };
}

export interface OpenHagicodeInAppWindowOptions {
  url: string;
  logScope: string;
  createWindow: () => HagicodeWindowLike;
  getTimestamp?: () => number;
}

export function buildFreshHagicodeUrl(rawUrl: string, getTimestamp: () => number = () => Date.now()): string {
  const parsedUrl = new URL(rawUrl);
  parsedUrl.searchParams.set(HAGICODE_CACHE_BYPASS_PARAM, String(getTimestamp()));
  return parsedUrl.toString();
}

export async function openHagicodeInAppWindow({
  url,
  logScope,
  createWindow,
  getTimestamp,
}: OpenHagicodeInAppWindowOptions): Promise<boolean> {
  if (!url) {
    console.error(`[${logScope}] No URL provided for open-hagicode-in-app`);
    return false;
  }

  try {
    const freshUrl = buildFreshHagicodeUrl(url, getTimestamp);
    console.log(`[${logScope}] Opening Hagicode in app window:`, freshUrl);

    const hagicodeWindow = createWindow();
    console.log(`[${logScope}] Hagicode window created`);

    hagicodeWindow.once('ready-to-show', () => {
      console.log(`[${logScope}] Hagicode window ready to show, maximizing...`);
      hagicodeWindow.maximize();
      hagicodeWindow.show();
      hagicodeWindow.focus();
    });

    hagicodeWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[${logScope}] Hagicode window failed to load:`, errorCode, errorDescription);
    });

    await hagicodeWindow.loadURL(freshUrl);
    console.log(`[${logScope}] Hagicode URL loaded successfully`);

    return true;
  } catch (error) {
    console.error(`[${logScope}] Failed to open Hagicode in app:`, error);
    return false;
  }
}
