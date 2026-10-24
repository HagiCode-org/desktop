import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');

describe('web service status listener equality guard', () => {
  it('skips dispatch and log for a payload equal to the last one', async () => {
    const source = await fs.readFile(storePath, 'utf-8');
    const listenerStart = source.indexOf('electronAPI.onWebServiceStatusChange?.((status: any) => {');
    const listenerEnd = source.indexOf('});', listenerStart);
    const listener = source.slice(listenerStart, listenerEnd);

    assert.notEqual(listenerStart, -1);
    assert.match(source, /let lastWebServiceStatus: Record<string, unknown> \| null = null;/);
    assert.match(listener, /if \(lastWebServiceStatus && isShallowEqualRecord\(lastWebServiceStatus, status\)\) \{\n      return;\n    \}/);
    assert.ok(listener.indexOf('isShallowEqualRecord') < listener.indexOf('store.dispatch(setProcessInfo(status))'));
    assert.ok(listener.indexOf('return;') < listener.indexOf("console.log('Web service status changed:'"));
  });
});
