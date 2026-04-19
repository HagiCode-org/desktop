import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ABOUT_WINDOW_PROTOCOLS,
  buildFreshHagicodeUrl,
  CODE_SERVER_WINDOW_PROTOCOLS,
  HAGICODE_CACHE_BYPASS_PARAM,
  openAboutWindow,
  openCodeServerWindow,
  openHagicodeInAppWindow,
  type HagicodeWindowLike,
} from '../hagicode-url.js';

function createMockWindow(options: {
  loadUrlError?: Error;
  autoDidFinishLoad?: boolean;
  executeJavaScript?: () => Promise<unknown>;
} = {}) {
  const readyHandlers: Array<() => void> = [];
  const closedHandlers: Array<() => void> = [];
  const unresponsiveHandlers: Array<() => void> = [];
  const failLoadHandlers: Array<(...args: any[]) => void> = [];
  const finishLoadHandlers: Array<() => void> = [];
  const consoleMessageHandlers: Array<(event: unknown, level: number, message: string, line: number, sourceId: string) => void> = [];
  const renderProcessGoneHandlers: Array<(event: unknown, details?: { reason?: string; exitCode?: number }) => void> = [];
  let loadedUrl: string | null = null;
  let maximizeCalls = 0;
  let showCalls = 0;
  let focusCalls = 0;
  let restoreCalls = 0;
  let minimized = false;
  let destroyed = false;

  const window: HagicodeWindowLike = {
    once(event, listener) {
      assert.equal(event, 'ready-to-show');
      readyHandlers.push(listener);
    },
    on(event, listener) {
      if (event === 'closed') {
        closedHandlers.push(listener);
        return;
      }

      assert.equal(event, 'unresponsive');
      unresponsiveHandlers.push(listener);
    },
    removeListener(event, listener) {
      const target = event === 'closed' ? closedHandlers : unresponsiveHandlers;
      const index = target.indexOf(listener);
      if (index >= 0) {
        target.splice(index, 1);
      }
    },
    maximize() {
      maximizeCalls += 1;
    },
    show() {
      showCalls += 1;
    },
    focus() {
      focusCalls += 1;
    },
    restore() {
      restoreCalls += 1;
      minimized = false;
    },
    isMinimized() {
      return minimized;
    },
    isDestroyed() {
      return destroyed;
    },
    async loadURL(url) {
      if (options.loadUrlError) {
        throw options.loadUrlError;
      }
      loadedUrl = url;

      if (options.autoDidFinishLoad !== false) {
        queueMicrotask(() => {
          for (const handler of [...finishLoadHandlers]) {
            handler();
          }
        });
      }
    },
    webContents: {
      on(event, listener) {
        if (event === 'did-fail-load') {
          failLoadHandlers.push(listener);
          return;
        }
        if (event === 'did-finish-load') {
          finishLoadHandlers.push(listener as () => void);
          return;
        }
        if (event === 'console-message') {
          consoleMessageHandlers.push(listener as typeof consoleMessageHandlers[number]);
          return;
        }

        assert.equal(event, 'render-process-gone');
        renderProcessGoneHandlers.push(listener as typeof renderProcessGoneHandlers[number]);
      },
      removeListener(event, listener) {
        const target = event === 'did-fail-load'
          ? failLoadHandlers
          : event === 'did-finish-load'
            ? finishLoadHandlers
            : event === 'console-message'
              ? consoleMessageHandlers
              : renderProcessGoneHandlers;
        const index = target.indexOf(listener as never);
        if (index >= 0) {
          target.splice(index, 1);
        }
      },
      executeJavaScript: async <T>() => {
        if (options.executeJavaScript) {
          return await options.executeJavaScript() as T;
        }

        return {
          ready: true,
          hasWorkbench: true,
          textLength: 120,
          visibleNodeCount: 3,
          title: 'Code Server',
        } as T;
      },
    },
  };

  return {
    window,
    readyHandlers,
    closedHandlers,
    failLoadHandlers,
    getLoadedUrl: () => loadedUrl,
    getWindowLifecycleCalls: () => ({
      maximizeCalls,
      showCalls,
      focusCalls,
      restoreCalls,
    }),
    setMinimized: (value: boolean) => {
      minimized = value;
    },
    emitDidFailLoad: (errorCode: number, errorDescription: string, validatedUrl?: string, isMainFrame?: boolean) => {
      for (const handler of [...failLoadHandlers]) {
        handler({}, errorCode, errorDescription, validatedUrl as never, isMainFrame as never);
      }
    },
    emitConsoleMessage: (level: number, message: string, line = 1, sourceId = 'workbench.js') => {
      for (const handler of [...consoleMessageHandlers]) {
        handler({}, level, message, line, sourceId);
      }
    },
    emitRenderProcessGone: (details?: { reason?: string; exitCode?: number }) => {
      for (const handler of [...renderProcessGoneHandlers]) {
        handler({}, details);
      }
    },
    emitUnresponsive: () => {
      for (const handler of [...unresponsiveHandlers]) {
        handler();
      }
    },
    destroy: () => {
      destroyed = true;
    },
  };
}

describe('hagicode URL helpers', () => {
  it('adds a cache-bypass query parameter to a plain service URL', () => {
    const freshUrl = buildFreshHagicodeUrl('http://127.0.0.1:36556', () => 1700000000000);
    const parsedUrl = new URL(freshUrl);

    assert.equal(parsedUrl.origin, 'http://127.0.0.1:36556');
    assert.equal(parsedUrl.pathname, '/');
    assert.equal(parsedUrl.searchParams.get(HAGICODE_CACHE_BYPASS_PARAM), '1700000000000');
  });

  it('preserves existing query parameters while appending the cache-bypass parameter', () => {
    const freshUrl = buildFreshHagicodeUrl('http://127.0.0.1:36556/?view=dashboard&tab=home', () => 1700000000001);
    const parsedUrl = new URL(freshUrl);

    assert.equal(parsedUrl.searchParams.get('view'), 'dashboard');
    assert.equal(parsedUrl.searchParams.get('tab'), 'home');
    assert.equal(parsedUrl.searchParams.get(HAGICODE_CACHE_BYPASS_PARAM), '1700000000001');
  });

  it('preserves hash fragments while appending the cache-bypass parameter', () => {
    const freshUrl = buildFreshHagicodeUrl('http://127.0.0.1:36556/settings?view=advanced#logs', () => 1700000000002);
    const parsedUrl = new URL(freshUrl);

    assert.equal(parsedUrl.pathname, '/settings');
    assert.equal(parsedUrl.hash, '#logs');
    assert.equal(parsedUrl.searchParams.get('view'), 'advanced');
    assert.equal(parsedUrl.searchParams.get(HAGICODE_CACHE_BYPASS_PARAM), '1700000000002');
  });

  it('generates different cache-bypass parameter values for repeated open actions', () => {
    const firstUrl = buildFreshHagicodeUrl('http://127.0.0.1:36556', () => 1700000000003);
    const secondUrl = buildFreshHagicodeUrl('http://127.0.0.1:36556', () => 1700000000004);

    assert.notEqual(firstUrl, secondUrl);
    assert.equal(new URL(firstUrl).searchParams.get(HAGICODE_CACHE_BYPASS_PARAM), '1700000000003');
    assert.equal(new URL(secondUrl).searchParams.get(HAGICODE_CACHE_BYPASS_PARAM), '1700000000004');
  });

  it('does not create a BrowserWindow when the Hagicode URL is invalid', async () => {
    let createWindowCalls = 0;

    const result = await openHagicodeInAppWindow({
      url: 'not-a-valid-url',
      logScope: 'Test',
      createWindow: () => {
        createWindowCalls += 1;
        return createMockWindow().window;
      },
    });

    assert.equal(result, false);
    assert.equal(createWindowCalls, 0);
  });

  it('loads the rewritten fresh URL into the Hagicode BrowserWindow', async () => {
    const mockWindow = createMockWindow();

    const result = await openHagicodeInAppWindow({
      url: 'http://127.0.0.1:36556/#welcome',
      logScope: 'Test',
      createWindow: () => mockWindow.window,
      getTimestamp: () => 1700000000005,
    });

    assert.equal(result, true);
    assert.equal(mockWindow.readyHandlers.length, 1);
    assert.equal(mockWindow.failLoadHandlers.length, 1);

    const loadedUrl = mockWindow.getLoadedUrl();
    assert.ok(loadedUrl);

    const parsedUrl = new URL(loadedUrl);
    assert.equal(parsedUrl.hash, '#welcome');
    assert.equal(parsedUrl.searchParams.get(HAGICODE_CACHE_BYPASS_PARAM), '1700000000005');

    mockWindow.readyHandlers[0]();
    assert.deepEqual(mockWindow.getWindowLifecycleCalls(), {
      maximizeCalls: 1,
      showCalls: 1,
      focusCalls: 1,
      restoreCalls: 0,
    });
  });

  it('rejects malformed Code Server URLs before creating a window', async () => {
    let createWindowCalls = 0;

    const result = await openCodeServerWindow({
      url: 'not-a-valid-url',
      logScope: 'Test',
      createWindow: () => {
        createWindowCalls += 1;
        return createMockWindow().window;
      },
    });

    assert.deepEqual(result, {
      success: false,
      state: 'render-failed',
      error: 'Invalid URL provided for open-code-server-window',
      failureStage: 'invalid-url',
      diagnosticsSummary: 'failure stage: invalid-url',
      diagnostics: {
        failureStage: 'invalid-url',
        lastUrl: undefined,
        lastConsoleErrors: [],
        failedLoads: [],
        rendererExit: undefined,
        unresponsive: false,
      },
      canOpenExternal: false,
      lastUrl: undefined,
    });
    assert.equal(createWindowCalls, 0);
  });

  it('rejects unsupported Code Server protocols before creating a window', async () => {
    let createWindowCalls = 0;

    const result = await openCodeServerWindow({
      url: 'file:///tmp/code-server',
      logScope: 'Test',
      createWindow: () => {
        createWindowCalls += 1;
        return createMockWindow().window;
      },
    });

    assert.deepEqual(result, {
      success: false,
      state: 'render-failed',
      error: 'Invalid URL protocol for open-code-server-window: file:',
      failureStage: 'invalid-url',
      diagnosticsSummary: 'failure stage: invalid-url',
      diagnostics: {
        failureStage: 'invalid-url',
        lastUrl: undefined,
        lastConsoleErrors: [],
        failedLoads: [],
        rendererExit: undefined,
        unresponsive: false,
      },
      canOpenExternal: false,
      lastUrl: undefined,
    });
    assert.equal(createWindowCalls, 0);
    assert.deepEqual(CODE_SERVER_WINDOW_PROTOCOLS, ['http:', 'https:']);
  });

  it('reports render-ready once the managed Code Server window passes the render probe', async () => {
    const mockWindow = createMockWindow();

    const result = await openCodeServerWindow({
      url: 'https://code.example.test/?folder=/workspace/project-1&tkn=token-123',
      logScope: 'Test',
      createWindow: () => mockWindow.window,
    });

    assert.deepEqual(result, {
      success: true,
      state: 'render-ready',
      lastUrl: 'https://code.example.test/?folder=/workspace/project-1&tkn=token-123',
      canOpenExternal: true,
      diagnostics: {
        failureStage: undefined,
        lastUrl: 'https://code.example.test/?folder=/workspace/project-1&tkn=token-123',
        lastConsoleErrors: [],
        failedLoads: [],
        rendererExit: undefined,
        unresponsive: false,
      },
    });
    assert.equal(
      mockWindow.getLoadedUrl(),
      'https://code.example.test/?folder=/workspace/project-1&tkn=token-123',
    );

    mockWindow.readyHandlers[0]();
    assert.deepEqual(mockWindow.getWindowLifecycleCalls(), {
      maximizeCalls: 1,
      showCalls: 1,
      focusCalls: 1,
      restoreCalls: 0,
    });
  });

  it('reports render-failed when the managed Code Server window stays blank past the probe timeout', async () => {
    const result = await openCodeServerWindow({
      url: 'https://code.example.test/?folder=/workspace/project-1&tkn=token-123',
      logScope: 'Test',
      createWindow: () => createMockWindow({
        executeJavaScript: async () => ({
          ready: false,
          hasWorkbench: false,
          textLength: 0,
          visibleNodeCount: 0,
          title: '',
        }),
      }).window,
      renderProbeTimeoutMs: 10,
      renderProbeIntervalMs: 1,
    });

    assert.equal(result.success, false);
    assert.equal(result.state, 'render-failed');
    assert.equal(result.failureStage, 'render-timeout');
    assert.equal(result.canOpenExternal, true);
    assert.match(result.error, /did not reach a rendered state/i);
    assert.match(result.diagnosticsSummary, /failure stage: render-timeout/);
    assert.equal(result.lastUrl, 'https://code.example.test/?folder=/workspace/project-1&tkn=token-123');
  });

  it('returns diagnostic summaries for console errors and renderer exits', async () => {
    const mockWindow = createMockWindow({
      autoDidFinishLoad: false,
    });

    const resultPromise = openCodeServerWindow({
      url: 'https://code.example.test/?folder=/workspace/project-2&tkn=token-456',
      logScope: 'Test',
      createWindow: () => mockWindow.window,
    });

    await Promise.resolve();
    mockWindow.emitConsoleMessage(3, 'Failed to load module chunk workbench.js', 42, 'app.js');
    mockWindow.emitRenderProcessGone({ reason: 'crashed', exitCode: 101 });

    const result = await resultPromise;

    assert.equal(result.success, false);
    assert.equal(result.state, 'render-failed');
    assert.equal(result.failureStage, 'render-process-gone');
    assert.equal(result.canOpenExternal, true);
    assert.equal(result.lastUrl, 'https://code.example.test/?folder=/workspace/project-2&tkn=token-456');
    assert.equal(result.diagnostics.rendererExit, 'crashed (101)');
    assert.deepEqual(result.diagnostics.lastConsoleErrors, [
      'app.js:42 Failed to load module chunk workbench.js',
    ]);
    assert.match(result.diagnosticsSummary, /console error: app\.js:42 Failed to load module chunk workbench\.js/);
    assert.match(result.diagnosticsSummary, /renderer exit: crashed \(101\)/);
  });

  it('creates the About popup, persists the device marker after show, and clears the ref on close', async () => {
    const mockWindow = createMockWindow();
    let existingWindow: HagicodeWindowLike | null = null;
    let shownAt: number | null = null;

    const result = await openAboutWindow({
      url: 'https://hagicode.com/about/',
      logScope: 'Test',
      createWindow: () => mockWindow.window,
      getExistingWindow: () => existingWindow,
      setExistingWindow: (nextWindow) => {
        existingWindow = nextWindow;
      },
      hasShownBefore: () => false,
      markShown: (nextShownAt) => {
        shownAt = nextShownAt;
      },
      getTimestamp: () => 1700000000006,
    });

    assert.deepEqual(result, { success: true, status: 'created' });
    assert.equal(mockWindow.getLoadedUrl(), 'https://hagicode.com/about/');
    assert.deepEqual(ABOUT_WINDOW_PROTOCOLS, ['http:', 'https:']);
    assert.equal(shownAt, null);
    assert.equal(existingWindow, mockWindow.window);

    mockWindow.readyHandlers[0]();
    assert.equal(shownAt, 1700000000006);
    assert.deepEqual(mockWindow.getWindowLifecycleCalls(), {
      maximizeCalls: 0,
      showCalls: 1,
      focusCalls: 1,
      restoreCalls: 0,
    });

    mockWindow.closedHandlers[0]();
    assert.equal(existingWindow, null);
  });

  it('focuses the existing About popup instead of creating another window', async () => {
    const existingWindow = createMockWindow();
    existingWindow.setMinimized(true);
    let createWindowCalls = 0;

    const result = await openAboutWindow({
      url: 'https://hagicode.com/about/',
      logScope: 'Test',
      createWindow: () => {
        createWindowCalls += 1;
        return createMockWindow().window;
      },
      getExistingWindow: () => existingWindow.window,
      setExistingWindow: () => {},
      hasShownBefore: () => false,
      markShown: () => {},
    });

    assert.deepEqual(result, { success: true, status: 'focused' });
    assert.equal(createWindowCalls, 0);
    assert.deepEqual(existingWindow.getWindowLifecycleCalls(), {
      maximizeCalls: 0,
      showCalls: 1,
      focusCalls: 1,
      restoreCalls: 1,
    });
  });

  it('suppresses repeated About auto popups once the device marker exists', async () => {
    let createWindowCalls = 0;

    const result = await openAboutWindow({
      url: 'https://hagicode.com/about/',
      logScope: 'Test',
      createWindow: () => {
        createWindowCalls += 1;
        return createMockWindow().window;
      },
      getExistingWindow: () => null,
      setExistingWindow: () => {},
      hasShownBefore: () => true,
      markShown: () => {},
    });

    assert.deepEqual(result, { success: true, status: 'suppressed' });
    assert.equal(createWindowCalls, 0);
  });
});
