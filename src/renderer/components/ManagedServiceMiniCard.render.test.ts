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

  it('surfaces enable-required and extracting states before normal lifecycle controls', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /const enableRequired = snapshot\?\.runtime\.primaryAction === 'enable';/);
    assert.match(source, /const enableInProgress = snapshot\?\.runtime\.status === 'extracting';/);
    assert.match(source, /onVendoredRuntimeActivationProgress/);
    assert.match(source, /dependencyManagement\.vendoredRuntime\.status\.enable-required/);
    assert.match(source, /dependencyManagement\.vendoredRuntime\.status\.extracting/);
    assert.match(source, /dependencyManagement\.vendoredRuntime\.actions\.enable/);
    assert.match(source, /status: \['completed', 'failed'\]\.includes\(event\.stage\) \? current\.runtime\.status : 'extracting'/);
  });

  it('keeps the dashboard overview wired to the mini cards', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /<CodeServerMiniCard \/>/);
    assert.match(source, /<OmniRouteMiniCard \/>/);
  });
});
