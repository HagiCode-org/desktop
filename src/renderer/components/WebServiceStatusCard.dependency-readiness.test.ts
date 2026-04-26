import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');
const actionButtonPath = path.resolve(process.cwd(), 'src/renderer/components/HagicodeActionButton.tsx');
const zhComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/components.json');
const enComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/components.json');

describe('home launch dependency readiness guard', () => {
  it('loads readiness with the shared evaluator and routes incomplete required readiness to dependency management', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /evaluateDependencyReadiness\(snapshot, \[npmInstallableAgentCliPackages\[0\]\?\.id\]\.filter\(Boolean\)\)/);
    assert.match(source, /window\.electronAPI\.dependencyManagement\.getSnapshot\(\)/);
    assert.match(source, /if \(!dependencyReadiness\?\.environmentAvailable \|\| !dependencyReadiness\?\.requiredReady\) \{\s*dispatch\(switchViewWithSideEffects\('dependency-management'\)\);\s*return;/);
    assert.match(source, /dispatch\(startWebService\(\)\);/);
    assert.match(source, /dependencyReadinessError \|\| t\('webServiceStatus\.dependencyReadinessAlert\.message'\)/);
  });

  it('changes the primary button label through HagicodeActionButton without removing the existing start behavior', async () => {
    const [cardSource, buttonSource] = await Promise.all([
      fs.readFile(cardPath, 'utf8'),
      fs.readFile(actionButtonPath, 'utf8'),
    ]);

    assert.match(buttonSource, /startLabel\?: string;/);
    assert.match(buttonSource, /startLabel \?\? t\('webServiceStatus\.startButton'\)/);
    assert.match(cardSource, /startLabel=\{isStopped && \(!dependencyReadiness\?\.environmentAvailable \|\| !dependencyReadiness\?\.requiredReady \|\| dependencyReadinessError\) \? t\('webServiceStatus\.dependencyReadinessButton'\) : undefined\}/);
  });

  it('adds localized dependency management entry and readiness failure feedback', async () => {
    const [zhRaw, enRaw] = await Promise.all([
      fs.readFile(zhComponentsPath, 'utf8'),
      fs.readFile(enComponentsPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(zh.webServiceStatus.dependencyReadinessButton, '进入依赖项管理');
    assert.equal(en.webServiceStatus.dependencyReadinessButton, 'Open Dependency Management');
    assert.equal(typeof zh.webServiceStatus.dependencyReadinessAlert.message, 'string');
    assert.equal(typeof en.webServiceStatus.dependencyReadinessAlert.message, 'string');
  });
});
