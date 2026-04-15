export const HAGICODE_CACHE_BYPASS_PARAM = 'hc_desktop_ts';
export const CODE_SERVER_WINDOW_PROTOCOLS = ['http:', 'https:'] as const;
export const ABOUT_WINDOW_PROTOCOLS = ['http:', 'https:'] as const;
export const WIZARD_LAST_STEP_ABOUT_POPUP_MARKER_KEY = 'wizardLastStepAboutPopup';

export type ManagedWindowOpenResult = {
  success: boolean;
  error?: string;
};

export type AboutWindowOpenStatus = 'created' | 'focused' | 'suppressed';

export type AboutWindowOpenResult = {
  success: boolean;
  status: AboutWindowOpenStatus;
  error?: string;
};

export interface HagicodeWindowLike {
  once(event: 'ready-to-show', listener: () => void): void;
  on?(event: 'closed', listener: () => void): void;
  maximize(): void;
  show(): void;
  focus(): void;
  restore?(): void;
  isMinimized?(): boolean;
  isDestroyed?(): boolean;
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

export interface OpenCodeServerWindowOptions {
  url: string;
  logScope: string;
  createWindow: () => HagicodeWindowLike;
}

export interface OpenAboutWindowOptions {
  url: string;
  logScope: string;
  createWindow: () => HagicodeWindowLike;
  getExistingWindow: () => HagicodeWindowLike | null;
  setExistingWindow: (window: HagicodeWindowLike | null) => void;
  hasShownBefore: () => boolean;
  markShown: (shownAt: number) => void;
  getTimestamp?: () => number;
}

type OpenManagedUrlWindowOptions = {
  actionName: string;
  url: string;
  logScope: string;
  createWindow: () => HagicodeWindowLike;
  rewriteUrl?: (url: string) => string;
  supportedProtocols?: readonly string[];
};

function isManagedWindowAlive(window: HagicodeWindowLike | null): window is HagicodeWindowLike {
  if (!window) {
    return false;
  }

  return !(window.isDestroyed?.() ?? false);
}

function focusManagedWindow(window: HagicodeWindowLike): void {
  if (window.isMinimized?.()) {
    window.restore?.();
  }

  window.show();
  window.focus();
}

export function buildFreshHagicodeUrl(rawUrl: string, getTimestamp: () => number = () => Date.now()): string {
  const parsedUrl = new URL(rawUrl);
  parsedUrl.searchParams.set(HAGICODE_CACHE_BYPASS_PARAM, String(getTimestamp()));
  return parsedUrl.toString();
}

function validateManagedWindowUrl(
  actionName: string,
  rawUrl: string,
  supportedProtocols?: readonly string[],
): ManagedWindowOpenResult & { loadUrl?: string } {
  if (!rawUrl) {
    return {
      success: false,
      error: `No URL provided for ${actionName}`,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return {
      success: false,
      error: `Invalid URL provided for ${actionName}`,
    };
  }

  if (supportedProtocols && !supportedProtocols.includes(parsedUrl.protocol)) {
    return {
      success: false,
      error: `Invalid URL protocol for ${actionName}: ${parsedUrl.protocol}`,
    };
  }

  return {
    success: true,
    loadUrl: parsedUrl.toString(),
  };
}

async function openManagedUrlWindow({
  actionName,
  url,
  logScope,
  createWindow,
  rewriteUrl,
  supportedProtocols,
}: OpenManagedUrlWindowOptions): Promise<ManagedWindowOpenResult> {
  const validation = validateManagedWindowUrl(actionName, url, supportedProtocols);
  if (!validation.success || !validation.loadUrl) {
    console.error(`[${logScope}] ${validation.error}`);
    return validation;
  }

  try {
    const loadUrl = rewriteUrl ? rewriteUrl(validation.loadUrl) : validation.loadUrl;
    console.log(`[${logScope}] Opening managed window for ${actionName}:`, loadUrl);

    const managedWindow = createWindow();
    console.log(`[${logScope}] Managed window created for ${actionName}`);

    managedWindow.once('ready-to-show', () => {
      console.log(`[${logScope}] Managed window ready to show for ${actionName}, maximizing...`);
      managedWindow.maximize();
      managedWindow.show();
      managedWindow.focus();
    });

    managedWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[${logScope}] Managed window failed to load for ${actionName}:`, errorCode, errorDescription);
    });

    await managedWindow.loadURL(loadUrl);
    console.log(`[${logScope}] Managed URL loaded successfully for ${actionName}`);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Failed to open ${actionName}`;
    console.error(`[${logScope}] Failed to open managed window for ${actionName}:`, error);
    return {
      success: false,
      error: message,
    };
  }
}

export async function openHagicodeInAppWindow({
  url,
  logScope,
  createWindow,
  getTimestamp,
}: OpenHagicodeInAppWindowOptions): Promise<boolean> {
  const result = await openManagedUrlWindow({
    actionName: 'open-hagicode-in-app',
    url,
    logScope,
    createWindow,
    rewriteUrl: (rawUrl) => buildFreshHagicodeUrl(rawUrl, getTimestamp),
  });

  return result.success;
}

export async function openCodeServerWindow({
  url,
  logScope,
  createWindow,
}: OpenCodeServerWindowOptions): Promise<ManagedWindowOpenResult> {
  // Desktop-managed Code Server windows only accept http(s) launch URLs.
  return await openManagedUrlWindow({
    actionName: 'open-code-server-window',
    url,
    logScope,
    createWindow,
    supportedProtocols: CODE_SERVER_WINDOW_PROTOCOLS,
  });
}

export async function openAboutWindow({
  url,
  logScope,
  createWindow,
  getExistingWindow,
  setExistingWindow,
  hasShownBefore,
  markShown,
  getTimestamp = () => Date.now(),
}: OpenAboutWindowOptions): Promise<AboutWindowOpenResult> {
  const existingWindow = getExistingWindow();
  if (isManagedWindowAlive(existingWindow)) {
    focusManagedWindow(existingWindow);
    return {
      success: true,
      status: 'focused',
    };
  }

  if (existingWindow) {
    setExistingWindow(null);
  }

  if (hasShownBefore()) {
    return {
      success: true,
      status: 'suppressed',
    };
  }

  const validation = validateManagedWindowUrl('open-about-window', url, ABOUT_WINDOW_PROTOCOLS);
  if (!validation.success || !validation.loadUrl) {
    console.error(`[${logScope}] ${validation.error}`);
    return {
      success: false,
      status: 'suppressed',
      error: validation.error,
    };
  }

  try {
    const aboutWindow = createWindow();
    setExistingWindow(aboutWindow);
    aboutWindow.on?.('closed', () => {
      setExistingWindow(null);
    });
    aboutWindow.once('ready-to-show', () => {
      focusManagedWindow(aboutWindow);
      markShown(getTimestamp());
    });
    aboutWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[${logScope}] About window failed to load:`, errorCode, errorDescription);
    });

    await aboutWindow.loadURL(validation.loadUrl);

    return {
      success: true,
      status: 'created',
    };
  } catch (error) {
    setExistingWindow(null);
    const message = error instanceof Error ? error.message : 'Failed to open About window';
    console.error(`[${logScope}] Failed to open About window:`, error);
    return {
      success: false,
      status: 'suppressed',
      error: message,
    };
  }
}
