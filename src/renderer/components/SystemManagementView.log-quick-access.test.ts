import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');

describe('system management log quick access wiring', () => {
  it('loads log-directory targets and refreshes them after active version changes', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /window\.electronAPI\.logDirectory\.listTargets\(\)/);
    assert.match(source, /onActiveVersionChanged\(\(version\) => \{\s*setActiveVersion\(version\);\s*void loadLogTargets\(false\);/s);
  });

  it('binds the web-app shortcut disabled state to the refreshed target availability', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /target:\s*'web-app'/);
    assert.match(source, /const isDisabled = isLogTargetsLoading \|\| isOpening \|\| !status\.available;/);
  });
});
