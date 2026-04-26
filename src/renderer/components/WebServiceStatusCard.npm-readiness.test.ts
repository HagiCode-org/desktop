import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');
const actionButtonPath = path.resolve(process.cwd(), 'src/renderer/components/HagicodeActionButton.tsx');
const zhComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/components.json');
const enComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/components.json');

describe('home launch npm readiness guard', () => {
  it('loads readiness with the shared evaluator and routes incomplete readiness to npm management', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /evaluateNpmReadiness\(snapshot, \[npmInstallableAgentCliPackages\[0\]\?\.id\]\.filter\(Boolean\)\)/);
    assert.match(source, /window\.electronAPI\.npmManagement\.getSnapshot\(\)/);
    assert.match(source, /if \(!npmReadiness\?\.ready\) \{\s*dispatch\(switchViewWithSideEffects\('npm-management'\)\);\s*return;/);
    assert.match(source, /dispatch\(startWebService\(\)\);/);
    assert.match(source, /npmReadinessError \|\| t\('webServiceStatus\.npmReadinessAlert\.message'\)/);
  });

  it('changes the primary button label through HagicodeActionButton without removing the existing start behavior', async () => {
    const [cardSource, buttonSource] = await Promise.all([
      fs.readFile(cardPath, 'utf8'),
      fs.readFile(actionButtonPath, 'utf8'),
    ]);

    assert.match(buttonSource, /startLabel\?: string;/);
    assert.match(buttonSource, /startLabel \?\? t\('webServiceStatus\.startButton'\)/);
    assert.match(cardSource, /startLabel=\{isStopped && \(!npmReadiness\?\.ready \|\| npmReadinessError\) \? t\('webServiceStatus\.npmReadinessButton'\) : undefined\}/);
  });

  it('adds localized npm management entry and readiness failure feedback', async () => {
    const [zhRaw, enRaw] = await Promise.all([
      fs.readFile(zhComponentsPath, 'utf8'),
      fs.readFile(enComponentsPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(zh.webServiceStatus.npmReadinessButton, '进入 npm 管理');
    assert.equal(en.webServiceStatus.npmReadinessButton, 'Enter npm Management');
    assert.equal(typeof zh.webServiceStatus.npmReadinessAlert.message, 'string');
    assert.equal(typeof en.webServiceStatus.npmReadinessAlert.message, 'string');
  });
});
