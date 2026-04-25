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
    assert.match(sidebarSource, />\s*Hagicode\s*</);
    assert.match(appSource, /import NpmManagementPage from '\.\/components\/NpmManagementPage';/);
    assert.match(appSource, /\{currentView === 'npm-management' && <NpmManagementPage \/>\}/);
  });

  it('keeps page behavior for loading, unavailable states, package rows, progress, batch logs, and inline errors', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /getNpmManagementBridge\(\)\.getSnapshot\(\)/);
    assert.match(source, /environment\.available/);
    assert.match(source, /npmManagement\.environment\.rationaleTitle/);
    assert.match(source, /npmManagement\.environment\.rationale\.fixedRuntime/);
    assert.match(source, /npmManagement\.environment\.rationale\.isolatedConfig/);
    assert.match(source, /npmManagement\.environment\.rationale\.nonIntrusive/);
    assert.match(source, /managedPackages\.map/);
    assert.match(source, /managedPackageRowClassName/);
    assert.match(source, /const canUninstall = item\.status === 'installed' && item\.definition\.required !== true;/);
    assert.match(source, /Progress value=\{itemProgress\?\.percentage \?\? 20\}/);
    assert.match(source, /batchSyncState/);
    assert.match(source, /BatchSyncLogPanel/);
    assert.match(source, /usesBatchSyncPanel/);
    assert.match(source, /operationError\[item\.id\]/);
  });

  it('renders the hagiscript bootstrap card and gated selectable package table', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /item\.id === 'hagiscript'/);
    assert.match(source, /npmManagement\.bootstrap\.title/);
    assert.match(source, /hagiscriptGateOpen/);
    assert.match(source, /npmManagement\.dependencyGate\.title/);
    assert.match(source, /npmManagement\.packageTable\.title/);
    assert.match(source, /Checkbox/);
    assert.match(source, /selectedPackageIds/);
    assert.match(source, /toggleSelectAll/);
    assert.match(source, /shouldPromoteHagiscriptCard/);
    assert.match(source, /getNpmManagementBridge\(\)\.syncPackages\(\{ packageIds \}\)/);
    assert.match(source, /npmManagement\.batchLog\.title/);
    assert.match(source, /npmManagement\.batchLog\.status\./);
    assert.match(source, /npmManagement\.categories\.\$\{item\.definition\.category\}/);
  });

  it('places the package table and batch log section before environment details while conditionally promoting the hagiscript card', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /npmManagement\.packageTable\.title[\s\S]*npmManagement\.environment\.title/);
    assert.match(source, /BatchSyncLogPanel batchSyncState=\{batchSyncState\}[\s\S]*npmManagement\.environment\.title/);
    assert.match(source, /\{shouldPromoteHagiscriptCard && hagiscriptCard\}/);
    assert.match(source, /\{!shouldPromoteHagiscriptCard && hagiscriptCard\}/);
  });

  it('uses row background colors instead of a dedicated status column for managed packages', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /status === 'installed'\s*\?\s*'bg-emerald-500\/10 hover:bg-emerald-500\/15'/);
    assert.match(source, /:\s*'bg-red-500\/10 hover:bg-red-500\/15'/);
    assert.match(source, /className=\{cn\(managedPackageRowClassName\(item\.status\)/);
    assert.doesNotMatch(source, /<TableHead>\{t\('npmManagement\.packageTable\.status'\)\}<\/TableHead>/);
  });

  it('only renders the uninstall action when a managed package is actually removable', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /\{canUninstall && \(/);
    assert.match(source, /runOperation\(item\.id, 'uninstall'\)/);
    assert.doesNotMatch(source, /disabled=\{rowDisabled \|\| item\.status !== 'installed' \|\| item\.definition\.required === true\}/);
  });

  it('renders mirror acceleration controls with save, revert, and disabled states', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /npmManagement\.mirror\.title/);
    assert.match(source, /npmManagement\.mirror\.toggleLabel/);
    assert.match(source, /npmManagement\.mirror\.registryUrl/);
    assert.match(source, /npmManagement\.mirror\.enabled/);
    assert.match(source, /npmManagement\.mirror\.disabled/);
    assert.match(source, /npmManagement\.mirror\.saving/);
    assert.match(source, /npmManagement\.mirror\.saveFailed/);
    assert.match(source, /getNpmManagementBridge\(\)\.setMirrorSettings\(\{ enabled \}\)/);
    assert.match(source, /setSnapshot\(previousSnapshot\)/);
    assert.match(source, /const mirrorToggleDisabled = isSavingMirrorSettings \|\| Boolean\(activePackageId\)/);
  });

  it('adds zh-CN and en-US localization keys', async () => {
    const [zh, en] = await Promise.all([
      fs.readFile(zhLocalePath, 'utf8'),
      fs.readFile(enLocalePath, 'utf8'),
    ]);

    assert.equal(JSON.parse(zh).sidebar.npmManagement, 'npm 管理');
    assert.equal(JSON.parse(en).sidebar.npmManagement, 'npm Management');
    assert.equal(typeof JSON.parse(zh).npmManagement.environment.status.available, 'string');
    assert.equal(typeof JSON.parse(zh).npmManagement.environment.rationaleTitle, 'string');
    assert.equal(typeof JSON.parse(zh).npmManagement.environment.rationale.fixedRuntime, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.environment.rationale.isolatedConfig, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.environment.rationale.nonIntrusive, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.actions.install, 'string');
    assert.equal(JSON.parse(en).npmManagement.categories['agent-cli'], 'Agent CLI');
    assert.equal(typeof JSON.parse(en).npmManagement.packages.claudeCode.description, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.packages.codex.description, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.packages.githubCopilot.description, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.packages.opencode.description, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.packages.qoder.description, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.packages.gemini.description, 'string');
    assert.equal(typeof JSON.parse(zh).npmManagement.dependencyGate.missing, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.batchLog.title, 'string');
    assert.equal(typeof JSON.parse(zh).npmManagement.batchLog.status.running, 'string');
    assert.equal(typeof JSON.parse(zh).npmManagement.selection.selectedCount, 'string');
    assert.equal(JSON.parse(zh).npmManagement.mirror.title, 'npm 镜像加速');
    assert.equal(JSON.parse(en).npmManagement.mirror.registryUrl, 'Registry URL');
    assert.equal(typeof JSON.parse(zh).npmManagement.mirror.saveFailed, 'string');
    assert.equal(typeof JSON.parse(en).npmManagement.mirror.enabledHelp, 'string');
  });
});
