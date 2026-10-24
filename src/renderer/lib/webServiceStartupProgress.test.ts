import assert from 'node:assert/strict';
import test from 'node:test';
import type { TFunction } from 'i18next';
import { getSlowStartSummary } from './webServiceStartupProgress.js';

function createTranslator(calls: Array<{ key: string; options?: Record<string, unknown> }>): TFunction<'components'> {
  return ((key: string, options?: Record<string, unknown>) => {
    calls.push({ key, options });
    return `Still starting (${String(options?.seconds)} seconds)`;
  }) as unknown as TFunction<'components'>;
}

test('formats the slow-start line with whole seconds', () => {
  const calls: Array<{ key: string; options?: Record<string, unknown> }> = [];

  const summary = getSlowStartSummary(createTranslator(calls), { elapsedMs: 35_000 });

  assert.equal(summary, 'Still starting (35 seconds)');
  assert.deepEqual(calls, [{
    key: 'webServiceStatus.startupProgress.slowStart',
    options: { seconds: 35 },
  }]);
});

test('floors partial seconds instead of rounding up', () => {
  const calls: Array<{ key: string; options?: Record<string, unknown> }> = [];

  getSlowStartSummary(createTranslator(calls), { elapsedMs: 35_999 });

  assert.deepEqual(calls[0]?.options, { seconds: 35 });
});

test('returns null when startup is not slow', () => {
  const calls: Array<{ key: string; options?: Record<string, unknown> }> = [];

  assert.equal(getSlowStartSummary(createTranslator(calls), null), null);
  assert.equal(calls.length, 0);
});
