import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');

describe('Settings page cleanup regression', () => {
  it('does not render deprecated debug tab entry', async () => {
    const source = await fs.readFile(settingsPagePath, 'utf-8');

    assert.equal(source.includes('value="debug"'), false);
    assert.equal(source.includes("t('settings.tabs.debug')"), false);
    assert.equal(source.includes('<DebugSettings />'), false);
  });
});
