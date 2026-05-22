import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ensureGeneratedLocales } from '../test-utils/ensure-generated-locales.mjs';

const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');
const actionButtonPath = path.resolve(process.cwd(), 'src/renderer/components/HagicodeActionButton.tsx');
const zhComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/zh-CN/components.json');
const enComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/en-US/components.json');

describe('home launch dependency readiness guard', () => {
  it('loads readiness with the shared evaluator and routes incomplete required readiness to dependency management', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /evaluateDependencyReadiness\(snapshot, \[npmInstallableAgentCliPackages\[0\]\?\.id\]\.filter\(Boolean\)\)/);
    assert.match(source, /window\.electronAPI\.dependencyManagement\.refresh\(\)/);
    assert.match(source, /if \(isStopped\) \{\s*void loadDependencyReadiness\(\);\s*\}/);
    assert.match(source, /if \(!dependencyReadiness\?\.environmentAvailable \|\| !dependencyReadiness\?\.requiredReady\) \{\s*dispatch\(switchViewWithSideEffects\('dependency-management'\)\);\s*return;/);
    assert.match(source, /const startHagicodePromise = dispatch\(startWebService\(\)\);/);
    assert.match(source, /dependencyReadinessError \|\| t\('webServiceStatus\.dependencyReadinessAlert\.message'\)/);
  });

  it('keeps the primary button on the default start label even when dependency readiness warns', async () => {
    const [cardSource, buttonSource] = await Promise.all([
      fs.readFile(cardPath, 'utf8'),
      fs.readFile(actionButtonPath, 'utf8'),
    ]);

    assert.match(buttonSource, /startLabel\?: string;/);
    assert.match(buttonSource, /startLabel \?\? t\('webServiceStatus\.startButton'\)/);
    assert.doesNotMatch(cardSource, /startLabel=\{/);
    assert.doesNotMatch(buttonSource, /"Hagicode" text/);
    assert.doesNotMatch(buttonSource, /Hagicode<\/motion\.span>/);
  });

  it('persists managed service startup toggles and fans out startup to selected services', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /AUTO_START_CODE_SERVER_STORAGE_KEY = 'webService\.autoStart\.codeServer'/);
    assert.match(source, /AUTO_START_OMNIROUTE_STORAGE_KEY = 'webService\.autoStart\.omniroute'/);
    assert.match(source, /readStoredStartupPreference\(AUTO_START_CODE_SERVER_STORAGE_KEY, true\)/);
    assert.match(source, /readStoredStartupPreference\(AUTO_START_OMNIROUTE_STORAGE_KEY, false\)/);
    assert.match(source, /window\.electronAPI\.codeServer\.start\(\)/);
    assert.match(source, /window\.electronAPI\.omniroute\.start\(\)/);
    assert.match(source, /await Promise\.allSettled\(\[startHagicodePromise, \.\.\.managedStartupTasks\]\);/);
  });

  it('adds localized dependency management entry and readiness failure feedback', async () => {
    await ensureGeneratedLocales();

    const [zhRaw, enRaw] = await Promise.all([
      fs.readFile(zhComponentsPath, 'utf8'),
      fs.readFile(enComponentsPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(zh.webServiceStatus.dependencyReadinessButton, '进入依赖项管理');
    assert.equal(en.webServiceStatus.dependencyReadinessButton, 'Open Dependency Management');
    assert.equal(zh.webServiceStatus.startButton, '启动 Hagicode 服务');
    assert.equal(en.webServiceStatus.startButton, 'Start Hagicode Service');
    assert.equal(zh.webServiceStatus.managedStartup.options.codeServer.label, '同时开启 code-server');
    assert.equal(en.webServiceStatus.managedStartup.options.codeServer.label, 'Start code-server together');
    assert.equal(typeof zh.webServiceStatus.dependencyReadinessAlert.message, 'string');
    assert.equal(typeof en.webServiceStatus.dependencyReadinessAlert.message, 'string');
  });
});
