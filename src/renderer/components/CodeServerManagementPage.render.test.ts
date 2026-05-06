import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/CodeServerManagementPage.tsx');
const viewSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/viewSlice.ts');
const zhLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/common.yml');
const enLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/common.yml');

describe('Code Server renderer wiring', () => {
  it('adds the first-level sidebar item and renders the page from App', async () => {
    const [sidebarSource, appSource, viewSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
      fs.readFile(viewSlicePath, 'utf8'),
    ]);

    assert.match(viewSource, /'code-server'/);
    assert.match(sidebarSource, /\{ id: 'code-server', labelKey: 'sidebar\.codeServer', icon: Server \}/);
    assert.match(appSource, /import CodeServerManagementPage from '\.\/components\/CodeServerManagementPage';/);
    assert.match(appSource, /\{currentView === 'code-server' && <CodeServerManagementPage \/>\}/);
  });

  it('renders lifecycle controls, password config, path buttons, logs, and managed window actions', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /window\.electronAPI\.codeServer/);
    assert.match(source, /getBridge\(\)\.getStatus\(\)/);
    assert.match(source, /getBridge\(\)\[action\]\(\)/);
    assert.match(source, /window\.electronAPI\.openCodeServerWindow\(status\.config\.baseUrl\)/);
    assert.match(source, /window\.electronAPI\.openExternal\(status\.config\.baseUrl\)/);
    assert.match(source, /validatePortInput/);
    assert.match(source, /validatePasswordInput/);
    assert.match(source, /password: passwordInput\.trim\(\)/);
    assert.match(source, /dispatch\(switchView\('dependency-management'\)\)/);
    assert.match(source, /PATH_TARGETS\.map/);
    assert.match(source, /getBridge\(\)\.openPath\(target\)/);
    assert.match(source, /LOG_TARGETS\.map/);
    assert.match(source, /getBridge\(\)\.readLog\(\{ target, maxLines: 200 \}\)/);
    assert.match(source, /codeServer\.config\.passwordLabel/);
    assert.match(source, /codeServer\.logs\.empty/);
  });

  it('adds zh-CN and en-US localization keys', async () => {
    const [zh, en] = await Promise.all([
      fs.readFile(zhLocalePath, 'utf8'),
      fs.readFile(enLocalePath, 'utf8'),
    ]);

    assert.match(zh, /sidebar:\n[\s\S]*codeServer: Code Server/);
    assert.match(zh, /codeServer:/);
    assert.match(zh, /passwordDescription:/);
    assert.match(zh, /openDesktop:/);
    assert.match(en, /codeServer:/);
    assert.match(en, /description: Manage the Desktop-owned code-server runtime/);
    assert.match(en, /passwordDescription:/);
    assert.match(en, /openDesktop:/);
  });
});
