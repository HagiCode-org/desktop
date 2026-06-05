import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ensureGeneratedLocales } from '../test-utils/ensure-generated-locales.mjs';

const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');
const actionButtonPath = path.resolve(process.cwd(), 'src/renderer/components/HagicodeActionButton.tsx');
const zhComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/zh-CN/components.json');
const enComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/en-US/components.json');

describe('hagicode action button port waiting state', () => {
  it('derives the waiting state from active lifecycle status without a ready URL', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /const hasReadyWebUrl = Boolean\(webServiceInfo\.url\?\.trim\(\)\);/);
    assert.match(source, /webServiceInfo\.status === 'starting'/);
    assert.match(source, /webServiceInfo\.status === 'running'/);
    assert.match(source, /webServiceInfo\.phase === 'waiting_listening'/);
    assert.match(source, /&& !hasReadyWebUrl/);
    assert.match(source, /isWaitingForPort=\{isWaitingForPort\}/);
    assert.match(source, /waitingPort=\{webServiceInfo\.port\}/);
    assert.match(source, /const startupSummary = getStartupPhaseSummary\(/);
    assert.match(source, /waitingPhaseMessage=\{startupSummary\}/);
  });

  it('renders localized disabled waiting feedback before the open actions branch', async () => {
    const source = await fs.readFile(actionButtonPath, 'utf8');

    assert.match(source, /isWaitingForPort\?: boolean;/);
    assert.match(source, /aria-disabled="true"/);
    assert.match(source, /cursor-not-allowed/);
    assert.match(source, /t\('webServiceStatus\.portWaiting\.title'\)/);
    assert.match(source, /t\('webServiceStatus\.portWaiting\.detailWithPort', \{ port: waitingPort \}\)/);
    assert.match(source, /t\('webServiceStatus\.portWaiting\.detail'\)/);
    assert.ok(
      source.indexOf('if (isWaitingForPort)') < source.indexOf('// Running state - Open buttons'),
      'waiting branch must gate the open action buttons'
    );
  });

  it('renders both starting and stopping as transition states on the primary button branch', async () => {
    const source = await fs.readFile(actionButtonPath, 'utf8');

    assert.match(source, /const isStarting = status === 'starting';/);
    assert.match(source, /const isStopping = status === 'stopping';/);
    assert.match(source, /const isTransitioning = isStarting \|\| isStopping;/);
    assert.match(source, /t\(isStopping \? 'webServiceStatus\.status\.stopping' : 'webServiceStatus\.status\.starting'\)/);
  });

  it('keeps ready URL state on the existing open action branch', async () => {
    const source = await fs.readFile(actionButtonPath, 'utf8');

    const openBranch = source.slice(source.indexOf('// Running state - Open buttons'));
    assert.match(openBranch, /onClick=\{onOpenApp\}/);
    assert.match(openBranch, /onClick=\{onOpenBrowser\}/);
    assert.match(openBranch, /t\('tray\.openInApp'\)/);
    assert.match(openBranch, /t\('tray\.openInBrowser'\)/);
  });

  it('adds localized waiting labels without inline component literals', async () => {
    await ensureGeneratedLocales();

    const [zhRaw, enRaw, buttonSource] = await Promise.all([
      fs.readFile(zhComponentsPath, 'utf8'),
      fs.readFile(enComponentsPath, 'utf8'),
      fs.readFile(actionButtonPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(zh.webServiceStatus.portWaiting.title, '正在等待端口可用');
    assert.equal(zh.webServiceStatus.portWaiting.detailWithPort, '端口 {{port}} 尚未可以访问');
    assert.equal(en.webServiceStatus.portWaiting.title, 'Waiting for port to become available');
    assert.equal(en.webServiceStatus.portWaiting.detailWithPort, 'Port {{port}} is not accessible yet');
    assert.doesNotMatch(buttonSource, /正在等待端口可用/);
    assert.doesNotMatch(buttonSource, /Waiting for port to become available/);
  });

  it('keeps startup progress copy localized through generated resources', async () => {
    await ensureGeneratedLocales();

    const [zhRaw, enRaw] = await Promise.all([
      fs.readFile(zhComponentsPath, 'utf8'),
      fs.readFile(enComponentsPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(zh.webServiceStatus.startupProgress.title, '正在启动服务');
    assert.equal(zh.webServiceStatus.startupProgress.stepLabels.checkingVersion, '检查版本');
    assert.equal(en.webServiceStatus.startupProgress.title, 'Starting service');
    assert.equal(en.webServiceStatus.startupProgress.stepLabels.healthCheck, 'Run health check');
  });
});
