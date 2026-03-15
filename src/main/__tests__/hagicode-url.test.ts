import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFreshHagicodeUrl,
  HAGICODE_CACHE_BYPASS_PARAM,
  openHagicodeInAppWindow,
  type HagicodeWindowLike,
} from '../hagicode-url.js';

function createMockWindow() {
  const readyHandlers: Array<() => void> = [];
  const failLoadHandlers: Array<(event: unknown, errorCode: number, errorDescription: string) => void> = [];
  let loadedUrl: string | null = null;
  let maximizeCalls = 0;
  let showCalls = 0;
  let focusCalls = 0;

  const window: HagicodeWindowLike = {
    once(event, listener) {
      assert.equal(event, 'ready-to-show');
      readyHandlers.push(listener);
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
    async loadURL(url) {
      loadedUrl = url;
    },
    webContents: {
      on(event, listener) {
        assert.equal(event, 'did-fail-load');
        failLoadHandlers.push(listener);
      },
    },
  };

  return {
    window,
    readyHandlers,
    failLoadHandlers,
    getLoadedUrl: () => loadedUrl,
    getWindowLifecycleCalls: () => ({
      maximizeCalls,
      showCalls,
      focusCalls,
    }),
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

  it('does not create a BrowserWindow when the URL is invalid', async () => {
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

  it('loads the rewritten fresh URL into the BrowserWindow', async () => {
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
    });
  });
});
