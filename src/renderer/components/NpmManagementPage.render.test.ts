import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/NpmManagementPage.tsx');
const zhLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/common.json');
const enLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/common.json');

describe('npm management renderer wiring', () => {
  it('adds the first-level sidebar item and renders the page from App', async () => {
    const [sidebarSource, appSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
    ]);

    assert.match(sidebarSource, /\{ id: 'npm-management', labelKey: 'sidebar\.npmManagement', icon: PackageOpen \}/);
    assert.match(appSource, /import NpmManagementPage from '\.\/components\/NpmManagementPage';/);
    assert.match(appSource, /\{currentView === 'npm-management' && <NpmManagementPage \/>\}/);
  });

  it('keeps page behavior for loading, unavailable states, package rows, progress, and inline errors', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /getNpmManagementBridge\(\)\.getSnapshot\(\)/);
    assert.match(source, /environment\.available/);
    assert.match(source, /snapshot\.packages\.map/);
    assert.match(source, /Progress value=\{itemProgress\.percentage \?\? 20\}/);
    assert.match(source, /operationError\[item\.id\]/);
  });

  it('adds zh-CN and en-US localization keys', async () => {
    const [zh, en] = await Promise.all([
      fs.readFile(zhLocalePath, 'utf8'),
      fs.readFile(enLocalePath, 'utf8'),
    ]);

    assert.equal(JSON.parse(zh).sidebar.npmManagement, 'npm 管理');
    assert.equal(JSON.parse(en).sidebar.npmManagement, 'npm Management');
    assert.equal(typeof JSON.parse(zh).npmManagement.environment.status.available, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.actions.install, 'string');
  });
});
