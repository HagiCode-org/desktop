import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { writeTextToClipboard } from './clipboard.js';

const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;

function setNavigator(value: Navigator | undefined): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value,
  });
}

function setWindow(value: Window | undefined): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  setNavigator(originalNavigator);
  setWindow(originalWindow);
});

describe('renderer clipboard helper', () => {
  it('prefers the browser clipboard API when it succeeds', async () => {
    const calls: string[] = [];

    setNavigator({
      clipboard: {
        async writeText(text: string) {
          calls.push(`browser:${text}`);
        },
      },
    } as Navigator);
    setWindow({
      electronAPI: {
        clipboard: {
          async writeText(text: string) {
            calls.push(`bridge:${text}`);
          },
        },
      },
    } as Window);

    await writeTextToClipboard('desktop');

    assert.deepEqual(calls, ['browser:desktop']);
  });

  it('falls back to the preload bridge when the browser clipboard rejects', async () => {
    const calls: string[] = [];

    setNavigator({
      clipboard: {
        async writeText() {
          calls.push('browser');
          throw new Error('denied');
        },
      },
    } as Navigator);
    setWindow({
      electronAPI: {
        clipboard: {
          async writeText(text: string) {
            calls.push(`bridge:${text}`);
          },
        },
      },
    } as Window);

    await writeTextToClipboard('fallback');

    assert.deepEqual(calls, ['browser', 'bridge:fallback']);
  });
});
