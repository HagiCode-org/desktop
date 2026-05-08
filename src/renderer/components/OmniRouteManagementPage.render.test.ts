import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ensureGeneratedLocales } from '../test-utils/ensure-generated-locales.mjs';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/OmniRouteManagementPage.tsx');
const viewSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/viewSlice.ts');
const zhLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/zh-CN/common.json');
const enLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/en-US/common.json');

describe('OmniRoute renderer wiring', () => {
  it('adds the first-level sidebar item and renders the page from App', async () => {
    const [sidebarSource, appSource, viewSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
      fs.readFile(viewSlicePath, 'utf8'),
    ]);

    assert.match(viewSource, /'omniroute'/);
    assert.match(sidebarSource, /\{ id: 'omniroute', labelKey: 'sidebar\.omniroute', icon: Network \}/);
    assert.match(appSource, /import OmniRouteManagementPage from '\.\/components\/OmniRouteManagementPage';/);
    assert.match(appSource, /\{currentView === 'omniroute' && <OmniRouteManagementPage \/>\}/);
  });

  it('renders status summary, lifecycle controls, path buttons, config validation, and logs', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /window\.electronAPI\.omniroute/);
    assert.match(source, /getBridge\(\)\.getStatus\(\)/);
    assert.match(source, /getBridge\(\)\[action\]\(\)/);
    assert.match(source, /runLifecycle\('repair'\)/);
    assert.match(source, /openOmniRouteDependencyRepair/);
    assert.match(source, /status\?\.remediation/);
    assert.match(source, /omniroute\.dependencyGuidance\.title/);
    assert.match(source, /omniroute\.dependencyGuidance\.openDependencyManagement/);
    assert.match(source, /omniroute\.actions\.repair/);
    assert.match(source, /dependencyManagement\.vendoredRuntime\.reinstallHint/);
    assert.match(source, /status\?\.config\.baseUrl/);
    assert.match(source, /nextStatus\.config\.password/);
    assert.match(source, /disabled=\{isBusy \|\| isRunning \|\| lifecycleBlockedByDependencies\}/);
    assert.match(source, /disabled=\{isBusy \|\| !isRunning\}/);
    assert.match(source, /disabled=\{isBusy \|\| lifecycleBlockedByDependencies\}/);
    assert.match(source, /validatePortInput/);
    assert.match(source, /validatePasswordInput/);
    assert.match(source, /password: passwordInput\.trim\(\)/);
    assert.match(source, /omniroute\.config\.passwordLabel/);
    assert.match(source, /PATH_TARGETS\.map/);
    assert.match(source, /getBridge\(\)\.openPath\(target\)/);
    assert.doesNotMatch(source, /setOperation\('open-path'\)/);
    assert.match(source, /LOG_TARGETS\.map/);
    assert.match(source, /getBridge\(\)\.readLog\(\{ target, maxLines: 200 \}\)/);
    assert.match(source, /omniroute\.logs\.empty/);
  });

  it('adds zh-CN and en-US localization keys', async () => {
    await ensureGeneratedLocales();

    const [zh, en] = await Promise.all([
      fs.readFile(zhLocalePath, 'utf8'),
      fs.readFile(enLocalePath, 'utf8'),
    ]);
    const zhJson = JSON.parse(zh) as Record<string, any>;
    const enJson = JSON.parse(en) as Record<string, any>;

    assert.equal(zhJson.sidebar.omniroute, 'OmniRoute');
    assert.equal(enJson.sidebar.omniroute, 'OmniRoute');
    assert.equal(typeof zhJson.omniroute.actions.start, 'string');
    assert.equal(typeof zhJson.omniroute.validation.range, 'string');
    assert.equal(typeof zhJson.omniroute.validation.passwordLength, 'string');
    assert.equal(typeof zhJson.omniroute.config.passwordDescription, 'string');
    assert.equal(typeof zhJson.omniroute.logs.targets['service-out'], 'string');
    assert.equal(typeof zhJson.omniroute.dependencyGuidance.openDependencyManagement, 'string');
    assert.equal(typeof enJson.omniroute.errors.operationFailed, 'string');
    assert.equal(typeof enJson.omniroute.dependencyGuidance.descriptionMissing, 'string');
    assert.equal(typeof enJson.dependencyManagement.packages.pm2.description, 'string');
  });
});
