import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const cardPath = path.resolve(process.cwd(), 'src/renderer/components/ManagedServiceMiniCard.tsx');
const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');

describe('managed service mini cards', () => {
  it('renders runtime versions for code-server and omniroute on the system dashboard cards', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /version\?: string \| null;/);
    assert.match(source, /t\('common\.version'\)/);
    assert.match(source, /version \?\? t\('dependencyManagement\.unavailable'\)/);
    assert.match(source, /version=\{snapshot\?\.runtime\.version \?\? null\}/);
  });

  it('keeps the dashboard overview wired to the mini cards', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /<CodeServerMiniCard \/>/);
    assert.match(source, /<OmniRouteMiniCard \/>/);
  });
});
