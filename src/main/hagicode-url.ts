export const HAGICODE_CACHE_BYPASS_PARAM = 'hc_desktop_ts';
export const CODE_SERVER_WINDOW_PROTOCOLS = ['http:', 'https:'] as const;
export const ABOUT_WINDOW_PROTOCOLS = ['http:', 'https:'] as const;
export const WIZARD_LAST_STEP_ABOUT_POPUP_MARKER_KEY = 'wizardLastStepAboutPopup';
const CODE_SERVER_RENDER_PROBE_TIMEOUT_MS = 8000;
const CODE_SERVER_RENDER_PROBE_INTERVAL_MS = 250;
const MAX_CODE_SERVER_DIAGNOSTIC_ENTRIES = 5;

export type ManagedWindowOpenResult = {
  success: boolean;
  error?: string;
};

export type CodeServerWindowState = 'render-ready' | 'render-failed';

export type CodeServerWindowFailureStage =
  | 'invalid-url'
  | 'load-url'
  | 'did-fail-load'
  | 'render-timeout'
  | 'probe-error'
  | 'render-process-gone'
  | 'unresponsive';

export interface CodeServerWindowDiagnostics {
  failureStage?: CodeServerWindowFailureStage;
  lastUrl?: string;
  lastConsoleErrors: string[];
  failedLoads: string[];
  rendererExit?: string;
  unresponsive: boolean;
}

export type CodeServerWindowOpenResult =
  | {
    success: true;
    state: 'render-ready';
    lastUrl: string;
    canOpenExternal: true;
    diagnostics: CodeServerWindowDiagnostics;
  }
  | {
    success: false;
    state: 'render-failed';
    error: string;
    failureStage: CodeServerWindowFailureStage;
    diagnosticsSummary: string;
    diagnostics: CodeServerWindowDiagnostics;
    canOpenExternal: boolean;
    lastUrl?: string;
  };

export type AboutWindowOpenStatus = 'created' | 'focused' | 'suppressed';

export type AboutWindowOpenResult = {
  success: boolean;
  status: AboutWindowOpenStatus;
  error?: string;
};

export interface HagicodeWindowLike {
  once(event: 'ready-to-show', listener: () => void): void;
  on?(event: 'closed' | 'unresponsive', listener: () => void): void;
  removeListener?(event: 'closed' | 'unresponsive', listener: () => void): void;
  maximize(): void;
  show(): void;
  focus(): void;
  restore?(): void;
  isMinimized?(): boolean;
  isDestroyed?(): boolean;
  loadURL(url: string): Promise<unknown>;
  webContents: {
    on(event: string, listener: (...args: any[]) => void): void;
    removeListener?(event: string, listener: (...args: any[]) => void): void;
    executeJavaScript?<T>(code: string, userGesture?: boolean): Promise<T>;
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
  renderProbeTimeoutMs?: number;
  renderProbeIntervalMs?: number;
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

type CodeServerRenderProbeSnapshot = {
  ready: boolean;
  hasWorkbench: boolean;
  textLength: number;
  visibleNodeCount: number;
  title: string;
};

const CODE_SERVER_RENDER_PROBE_SCRIPT = `(() => {
  const body = document.body;
  const visibleNodes = Array.from(body?.children ?? []).filter((node) => {
    const tagName = node.tagName?.toUpperCase?.() ?? '';
    if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'LINK') {
      return false;
    }

    if (!(node instanceof HTMLElement)) {
      return true;
    }

    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });

  const textContent = body?.innerText?.trim() ?? '';
  const hasWorkbench = Boolean(
    document.querySelector(
      '.monaco-workbench, .monaco-shell, #workbench-container, [data-keybinding-context], .part.editor',
    ),
  );

  return {
    ready: hasWorkbench || visibleNodes.length > 0 || textContent.length > 0,
    hasWorkbench,
    textLength: textContent.length,
    visibleNodeCount: visibleNodes.length,
    title: document.title ?? '',
  };
})()`;

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

function cloneCodeServerDiagnostics(
  diagnostics: CodeServerWindowDiagnostics,
  failureStage?: CodeServerWindowFailureStage,
): CodeServerWindowDiagnostics {
  return {
    failureStage: failureStage ?? diagnostics.failureStage,
    lastUrl: diagnostics.lastUrl,
    lastConsoleErrors: [...diagnostics.lastConsoleErrors],
    failedLoads: [...diagnostics.failedLoads],
    rendererExit: diagnostics.rendererExit,
    unresponsive: diagnostics.unresponsive,
  };
}

function pushLimitedDiagnosticEntry(target: string[], value?: string): void {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return;
  }

  target.push(normalizedValue);
  if (target.length > MAX_CODE_SERVER_DIAGNOSTIC_ENTRIES) {
    target.splice(0, target.length - MAX_CODE_SERVER_DIAGNOSTIC_ENTRIES);
  }
}

function buildCodeServerDiagnosticsSummary(
  diagnostics: CodeServerWindowDiagnostics,
  failureStage: CodeServerWindowFailureStage,
): string {
  const segments = [`failure stage: ${failureStage}`];
  if (diagnostics.lastUrl) {
    segments.push(`last url: ${diagnostics.lastUrl}`);
  }
  if (diagnostics.lastConsoleErrors[0]) {
    segments.push(`console error: ${diagnostics.lastConsoleErrors[0]}`);
  }
  if (diagnostics.failedLoads[0]) {
    segments.push(`load failure: ${diagnostics.failedLoads[0]}`);
  }
  if (diagnostics.rendererExit) {
    segments.push(`renderer exit: ${diagnostics.rendererExit}`);
  }
  if (diagnostics.unresponsive) {
    segments.push('window became unresponsive');
  }

  return segments.join(' | ');
}

function buildCodeServerFailureResult(
  logScope: string,
  loadUrl: string | undefined,
  diagnostics: CodeServerWindowDiagnostics,
  failureStage: CodeServerWindowFailureStage,
  error: string,
  canOpenExternal: boolean,
): CodeServerWindowOpenResult {
  const nextDiagnostics = cloneCodeServerDiagnostics(diagnostics, failureStage);
  const diagnosticsSummary = buildCodeServerDiagnosticsSummary(nextDiagnostics, failureStage);

  console.error(`[${logScope}] Code Server window failed during ${failureStage}:`, {
    error,
    diagnosticsSummary,
    diagnostics: nextDiagnostics,
  });

  return {
    success: false,
    state: 'render-failed',
    error,
    failureStage,
    diagnosticsSummary,
    diagnostics: nextDiagnostics,
    canOpenExternal,
    lastUrl: nextDiagnostics.lastUrl ?? loadUrl,
  };
}

async function executeCodeServerRenderProbe(
  managedWindow: HagicodeWindowLike,
): Promise<CodeServerRenderProbeSnapshot> {
  const executeJavaScript = managedWindow.webContents.executeJavaScript;
  if (typeof executeJavaScript !== 'function') {
    throw new Error('Code Server render probe is unavailable for the managed window.');
  }

  return await executeJavaScript<CodeServerRenderProbeSnapshot>(CODE_SERVER_RENDER_PROBE_SCRIPT);
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
  renderProbeTimeoutMs = CODE_SERVER_RENDER_PROBE_TIMEOUT_MS,
  renderProbeIntervalMs = CODE_SERVER_RENDER_PROBE_INTERVAL_MS,
}: OpenCodeServerWindowOptions): Promise<CodeServerWindowOpenResult> {
  const actionName = 'open-code-server-window';
  const validation = validateManagedWindowUrl(actionName, url, CODE_SERVER_WINDOW_PROTOCOLS);
  if (!validation.success || !validation.loadUrl) {
    const error = validation.error ?? `Failed to open ${actionName}`;
    console.error(`[${logScope}] ${error}`);
    return buildCodeServerFailureResult(
      logScope,
      undefined,
      {
        failureStage: 'invalid-url',
        lastUrl: undefined,
        lastConsoleErrors: [],
        failedLoads: [],
        rendererExit: undefined,
        unresponsive: false,
      },
      'invalid-url',
      error,
      false,
    );
  }

  const loadUrl = validation.loadUrl;
  const diagnostics: CodeServerWindowDiagnostics = {
    lastUrl: loadUrl,
    lastConsoleErrors: [],
    failedLoads: [],
    rendererExit: undefined,
    unresponsive: false,
  };

  try {
    console.log(`[${logScope}] Opening dedicated Code Server window:`, loadUrl);
    const managedWindow = createWindow();
    console.log(`[${logScope}] Dedicated Code Server window created`);

    managedWindow.once('ready-to-show', () => {
      console.log(`[${logScope}] Code Server window ready to show, maximizing...`);
      managedWindow.maximize();
      managedWindow.show();
      managedWindow.focus();
    });

    const result = await new Promise<CodeServerWindowOpenResult>((resolve) => {
      let settled = false;
      let probeStarted = false;
      let probeTimer: ReturnType<typeof setTimeout> | null = null;
      const probeDeadline = Date.now() + renderProbeTimeoutMs;

      const cleanup = () => {
        if (probeTimer) {
          clearTimeout(probeTimer);
          probeTimer = null;
        }

        managedWindow.removeListener?.('unresponsive', handleUnresponsive);
        managedWindow.webContents.removeListener?.('did-fail-load', handleDidFailLoad);
        managedWindow.webContents.removeListener?.('did-finish-load', handleDidFinishLoad);
        managedWindow.webContents.removeListener?.('console-message', handleConsoleMessage);
        managedWindow.webContents.removeListener?.('render-process-gone', handleRenderProcessGone);
      };

      const settle = (resultValue: CodeServerWindowOpenResult) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(resultValue);
      };

      const settleFailure = (failureStage: CodeServerWindowFailureStage, error: string) => {
        settle(
          buildCodeServerFailureResult(
            logScope,
            loadUrl,
            diagnostics,
            failureStage,
            error,
            true,
          ),
        );
      };

      const runRenderProbe = async () => {
        if (settled) {
          return;
        }

        try {
          const snapshot = await executeCodeServerRenderProbe(managedWindow);
          if (snapshot.ready) {
            const nextDiagnostics = cloneCodeServerDiagnostics(diagnostics);
            console.log(`[${logScope}] Code Server render probe passed`, snapshot);
            settle({
              success: true,
              state: 'render-ready',
              lastUrl: nextDiagnostics.lastUrl ?? loadUrl,
              canOpenExternal: true,
              diagnostics: nextDiagnostics,
            });
            return;
          }

          if (Date.now() >= probeDeadline) {
            settleFailure(
              'render-timeout',
              `Code Server opened but did not reach a rendered state within ${renderProbeTimeoutMs}ms.`,
            );
            return;
          }

          console.warn(`[${logScope}] Code Server render probe not ready yet`, snapshot);
          probeTimer = setTimeout(() => {
            void runRenderProbe();
          }, renderProbeIntervalMs);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Code Server render probe failed.';
          settleFailure('probe-error', message);
        }
      };

      const handleDidFinishLoad = () => {
        if (probeStarted) {
          return;
        }

        probeStarted = true;
        console.log(`[${logScope}] Code Server did-finish-load received, starting render probe`);
        void runRenderProbe();
      };

      const handleDidFailLoad = (
        _event: unknown,
        errorCode: number,
        errorDescription: string,
        validatedUrl?: string,
        isMainFrame?: boolean,
      ) => {
        const loadFailure = `${errorCode}: ${errorDescription}${validatedUrl ? ` (${validatedUrl})` : ''}`;
        pushLimitedDiagnosticEntry(diagnostics.failedLoads, loadFailure);
        if (typeof validatedUrl === 'string' && validatedUrl.trim()) {
          diagnostics.lastUrl = validatedUrl;
        }

        if (isMainFrame === false) {
          return;
        }

        settleFailure(
          'did-fail-load',
          `Code Server failed to load (${errorCode}): ${errorDescription}`,
        );
      };

      const handleConsoleMessage = (
        _event: unknown,
        level: number,
        message: string,
        line: number,
        sourceId: string,
      ) => {
        if (level < 2) {
          return;
        }

        const prefix = sourceId ? `${sourceId}:${line}` : `line ${line}`;
        pushLimitedDiagnosticEntry(diagnostics.lastConsoleErrors, `${prefix} ${message}`);
      };

      const handleRenderProcessGone = (_event: unknown, details?: { reason?: string; exitCode?: number }) => {
        diagnostics.rendererExit = details?.reason
          ? `${details.reason}${typeof details.exitCode === 'number' ? ` (${details.exitCode})` : ''}`
          : 'unknown';
        settleFailure('render-process-gone', 'Code Server renderer process exited unexpectedly.');
      };

      const handleUnresponsive = () => {
        diagnostics.unresponsive = true;
        settleFailure('unresponsive', 'Code Server window became unresponsive.');
      };

      managedWindow.on?.('unresponsive', handleUnresponsive);
      managedWindow.webContents.on('did-fail-load', handleDidFailLoad);
      managedWindow.webContents.on('did-finish-load', handleDidFinishLoad);
      managedWindow.webContents.on('console-message', handleConsoleMessage);
      managedWindow.webContents.on('render-process-gone', handleRenderProcessGone);

      void managedWindow.loadURL(loadUrl).catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to open Code Server';
        settleFailure('load-url', message);
      });
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open Code Server';
    return buildCodeServerFailureResult(logScope, loadUrl, diagnostics, 'load-url', message, true);
  }
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
