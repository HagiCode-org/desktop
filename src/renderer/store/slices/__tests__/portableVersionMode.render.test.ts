import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const versionPagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');

describe('portable version renderer integration', () => {
  it('loads distribution mode during bootstrap and redirects version view back to system mode', async () => {
    const source = await fs.readFile(appPath, 'utf-8');

    assert.match(source, /getDistributionMode/);
    assert.match(source, /setDistributionMode\(mode\)/);
    assert.match(source, /distributionMode === 'steam' && currentView === 'version'/);
    assert.match(source, /dispatch\(switchView\('system'\)\)/);
  });

  it('hides version navigation while keeping the remaining sidebar items intact', async () => {
    const source = await fs.readFile(sidebarPath, 'utf-8');

    assert.match(source, /distributionMode === 'steam'/);
    assert.match(source, /navigationItems\.filter\(\(item\) => item\.id !== 'version'\)/);
  });

  it('replaces mutable version controls with a portable mode notice when forced open', async () => {
    const source = await fs.readFile(versionPagePath, 'utf-8');

    assert.match(source, /distributionMode === 'steam'/);
    assert.match(source, /versionManagement\.portableMode\.title/);
    assert.match(source, /versionManagement\.portableMode\.activeRuntime/);
    assert.match(source, /versionManagement\.portableMode\.updates/);
  });
});
