import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import { DESKTOP_LANGUAGES } from '../../shared/desktop-languages.js';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/CodeServerManagementPage.tsx');
const viewSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/viewSlice.ts');
const localesRoot = path.resolve(process.cwd(), 'src/renderer/i18n/locales');

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

  it('renders activation-aware lifecycle controls, password config, path buttons, logs, and managed window actions', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /type Operation = 'enable' \| 'start' \| 'stop' \| 'restart' \| 'repair'/);
    assert.match(source, /window\.electronAPI\.codeServer/);
    assert.match(source, /getBridge\(\)\.getStatus\(\)/);
    assert.match(source, /getBridge\(\)\[action\]\(\)/);
    assert.match(source, /window\.electronAPI\.dependencyManagement\.enableVendoredRuntime\('code-server'\)/);
    assert.match(source, /window\.electronAPI\.dependencyManagement\.onVendoredRuntimeActivationProgress/);
    assert.match(source, /const activationInProgress = status\?\.runtime\.status === 'extracting';/);
    assert.match(source, /const runtimeEnableAvailable = runtimePrimaryAction === 'enable';/);
    assert.match(source, /dependencyManagement\.vendoredRuntime\.activationInline/);
    assert.match(source, /dependencyManagement\.vendoredRuntime\.actions\.enable/);
    assert.match(source, /window\.electronAPI\.openCodeServerWindow\(status\.config\.baseUrl, status\.config\.password\)/);
    assert.match(source, /window\.electronAPI\.openCodeServerExternal\(status\.config\.baseUrl, status\.config\.password\)/);
    assert.match(source, /validatePortInput/);
    assert.match(source, /validatePasswordInput/);
    assert.match(source, /password: passwordInput\.trim\(\)/);
    assert.match(source, /dispatch\(switchView\('dependency-management'\)\)/);
    assert.match(source, /runLifecycle\('repair'\)/);
    assert.match(source, /const lifecycleBlockedReason = status\?\.error \?\? status\?\.runtime\.message \?\? t\('system\.services\.notReady'\);/);
    assert.match(source, /if \(\(action === 'start' \|\| action === 'restart'\) && lifecycleBlocked\) \{/);
    assert.match(source, /setErrorMessage\(lifecycleBlockedReason\);/);
    assert.match(source, /codeServer\.actions\.repair/);
    assert.match(source, /dependencyManagement\.vendoredRuntime\.reinstallHint/);
    assert.match(source, /status\?\.runtime\.version \?\? t\('dependencyManagement\.unavailable'\)/);
    assert.match(source, /PATH_TARGETS\.map/);
    assert.match(source, /getBridge\(\)\.openPath\(target\)/);
    assert.match(source, /LOG_TARGETS\.map/);
    assert.match(source, /getBridge\(\)\.readLog\(\{ target, maxLines: 200 \}\)/);
    assert.match(source, /codeServer\.config\.passwordLabel/);
    assert.match(source, /codeServer\.logs\.empty/);
  });

  it('keeps top-level codeServer localization keys complete for every supported language', async () => {
    for (const language of DESKTOP_LANGUAGES) {
      const raw = await fs.readFile(path.join(localesRoot, language.code, 'common.yml'), 'utf8');
      assert.match(raw, /sidebar:\n[\s\S]*codeServer: Code Server/);

      const parsed = load(raw) as Record<string, unknown>;
      const codeServer = parsed.codeServer as Record<string, unknown> | undefined;
      assert.ok(codeServer, `${language.code} must define a top-level codeServer section`);
      assert.equal(typeof codeServer.title, 'string');
      assert.equal(typeof codeServer.description, 'string');
      assert.equal(typeof codeServer.loading, 'string');

      const actions = codeServer.actions as Record<string, unknown> | undefined;
      assert.ok(actions, `${language.code} must define codeServer.actions`);
      assert.equal(typeof actions?.openDesktop, 'string');
      assert.equal(typeof actions?.openBrowser, 'string');
      assert.equal(typeof actions?.refreshLogs, 'string');

      const status = codeServer.status as Record<string, unknown> | undefined;
      assert.ok(status, `${language.code} must define codeServer.status`);
      assert.equal(typeof status?.runtimeStatus, 'string');
      assert.equal(typeof status?.passwordModeValue, 'string');

      const config = codeServer.config as Record<string, unknown> | undefined;
      assert.ok(config, `${language.code} must define codeServer.config`);
      assert.equal(typeof config?.passwordDescription, 'string');

      const paths = codeServer.paths as Record<string, unknown> | undefined;
      assert.ok(paths, `${language.code} must define codeServer.paths`);
      assert.equal(typeof paths?.['runtime-root'], 'string');

      const logs = codeServer.logs as Record<string, unknown> | undefined;
      assert.ok(logs, `${language.code} must define codeServer.logs`);
      assert.equal(typeof logs?.empty, 'string');

      const dependencyGuidance = codeServer.dependencyGuidance as Record<string, unknown> | undefined;
      assert.ok(dependencyGuidance, `${language.code} must define codeServer.dependencyGuidance`);
      assert.equal(typeof dependencyGuidance?.description, 'string');
      assert.equal(typeof dependencyGuidance?.openDependencyManagement, 'string');

      const errors = codeServer.errors as Record<string, unknown> | undefined;
      assert.ok(errors, `${language.code} must define codeServer.errors`);
      assert.equal(typeof errors?.openWindowFailed, 'string');
    }
  });
});
