import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDesktopTheme,
  readSavedDesktopTheme,
  resolveDesktopTheme,
  resolveInitialDesktopTheme,
} from './desktop-theme.ts';

function createStorage(initialValue: string | null) {
  let value = initialValue;
  let removeCalls = 0;

  return {
    storage: {
      getItem() {
        return value;
      },
      removeItem() {
        value = null;
        removeCalls += 1;
      },
    },
    getRemoveCalls() {
      return removeCalls;
    },
  };
}

function createThemeTarget() {
  const classes = new Set<string>(['light', 'legacy-theme']);

  return {
    target: {
      classList: {
        add(...tokens: string[]) {
          tokens.forEach((token) => classes.add(token));
        },
        remove(...tokens: string[]) {
          tokens.forEach((token) => classes.delete(token));
        },
      },
      style: {
        colorScheme: '',
      },
    },
    getClasses() {
      return Array.from(classes);
    },
  };
}

test('readSavedDesktopTheme returns a valid persisted theme', () => {
  const { storage, getRemoveCalls } = createStorage('dark');

  assert.equal(readSavedDesktopTheme(storage), 'dark');
  assert.equal(getRemoveCalls(), 0);
});

test('readSavedDesktopTheme removes invalid persisted values', () => {
  const { storage, getRemoveCalls } = createStorage('lunar-new-year');

  assert.equal(readSavedDesktopTheme(storage), null);
  assert.equal(getRemoveCalls(), 1);
});

test('resolveDesktopTheme prefers the saved theme over the system mode', () => {
  assert.equal(resolveDesktopTheme('light', true), 'light');
  assert.equal(resolveDesktopTheme('dark', false), 'dark');
});

test('resolveInitialDesktopTheme falls back to the system dark mode when there is no saved theme', () => {
  assert.equal(resolveInitialDesktopTheme({ mediaQueryList: { matches: true } }), 'dark');
});

test('resolveInitialDesktopTheme falls back to light when saved theme is missing or invalid', () => {
  const missingStorage = createStorage(null);
  const invalidStorage = createStorage('system');

  assert.equal(
    resolveInitialDesktopTheme({
      storage: missingStorage.storage,
      mediaQueryList: { matches: false },
    }),
    'light',
  );

  assert.equal(
    resolveInitialDesktopTheme({
      storage: invalidStorage.storage,
      mediaQueryList: { matches: false },
    }),
    'light',
  );
});

test('applyDesktopTheme keeps only the active light or dark class and syncs color-scheme', () => {
  const { target, getClasses } = createThemeTarget();

  applyDesktopTheme(target, 'dark');

  assert.deepEqual(getClasses().sort(), ['dark', 'legacy-theme']);
  assert.equal(target.style.colorScheme, 'dark');
});
