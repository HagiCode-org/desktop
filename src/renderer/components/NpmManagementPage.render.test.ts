import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/NpmManagementPage.tsx');
const modelPath = path.resolve(process.cwd(), 'src/renderer/components/npm-management/npmManagementPageModel.ts');
const packageGroupsPath = path.resolve(process.cwd(), 'src/renderer/components/npm-management/NpmPackageGroups.tsx');
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
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /getNpmManagementBridge\(\)\.getSnapshot\(\)/);
    assert.match(pageSource, /environment\.available/);
    assert.match(pageSource, /npmManagement\.environment\.rationaleTitle/);
    assert.match(pageSource, /npmManagement\.environment\.rationale\.fixedRuntime/);
    assert.match(pageSource, /npmManagement\.environment\.rationale\.isolatedConfig/);
    assert.match(pageSource, /npmManagement\.environment\.rationale\.nonIntrusive/);
    assert.match(modelSource, /managedPackageRowClassName/);
    assert.match(packageGroupsSource, /packages\.map/);
    assert.match(packageGroupsSource, /const canUninstall = item\.status === 'installed' && item\.definition\.required !== true;/);
    assert.match(packageGroupsSource, /Progress value=\{itemProgress\?\.percentage \?\? 20\}/);
    assert.match(pageSource, /batchSyncState/);
    assert.match(packageGroupsSource, /BatchSyncLogPanel/);
    assert.match(packageGroupsSource, /usesBatchSyncPanel/);
    assert.match(packageGroupsSource, /operationErrorByPackageId\[item\.id\]/);
  });

  it('keeps extracted npm management helpers and package group components wired into the page', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /from '\.\/npm-management\/npmManagementPageModel'/);
    assert.match(pageSource, /from '\.\/npm-management\/NpmPackageGroups'/);
    assert.match(pageSource, /appendBatchSyncLog\(current, event\)/);
    assert.match(pageSource, /getSelectablePackageIds\(managedPackages/);
    assert.match(pageSource, /getSelectedEligiblePackageIds\(selectedPackageIds, selectablePackageIds\)/);
    assert.match(pageSource, /getSelectAllChecked\(selectedPackageIds, selectablePackageIds\)/);
    assert.match(pageSource, /<NpmPackageBootstrapCard/);
    assert.match(pageSource, /<NpmPackageTable/);
    assert.match(pageSource, /<BatchSyncLogPanel batchSyncState=\{batchSyncState\}/);

    assert.match(modelSource, /export function isOperationActive/);
    assert.match(modelSource, /export function appendBatchSyncLog/);
    assert.match(modelSource, /export function getSelectablePackageIds/);
    assert.match(modelSource, /export function updateSelectedPackageIds/);
    assert.match(modelSource, /export function managedPackageRowClassName/);

    assert.match(packageGroupsSource, /export function NpmPackageBootstrapCard/);
    assert.match(packageGroupsSource, /export function NpmPackageTable/);
    assert.match(packageGroupsSource, /export function BatchSyncLogPanel/);
    assert.match(packageGroupsSource, /npmManagement\.packageTable\.title/);
    assert.match(packageGroupsSource, /npmManagement\.selection\.selectPackage/);
    assert.match(packageGroupsSource, /npmManagement\.batchLog\.title/);
  });

  it('renders the hagiscript bootstrap card and gated selectable package table', async () => {
    const [pageSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /item\.id === 'hagiscript'/);
    assert.match(packageGroupsSource, /npmManagement\.bootstrap\.title/);
    assert.match(pageSource, /hagiscriptGateOpen/);
    assert.match(packageGroupsSource, /dependencyGateMessage/);
    assert.match(packageGroupsSource, /npmManagement\.packageTable\.title/);
    assert.match(packageGroupsSource, /Checkbox/);
    assert.match(pageSource, /selectedPackageIds/);
    assert.match(pageSource, /toggleSelectAll/);
    assert.match(pageSource, /shouldPromoteHagiscriptCard/);
    assert.match(pageSource, /getNpmManagementBridge\(\)\.syncPackages\(\{ packageIds \}\)/);
    assert.match(packageGroupsSource, /npmManagement\.batchLog\.title/);
    assert.match(packageGroupsSource, /npmManagement\.batchLog\.status\./);
    assert.match(packageGroupsSource, /npmManagement\.categories\.\$\{item\.definition\.category\}/);
  });

  it('places the package table and batch log section before environment details while conditionally promoting the hagiscript card', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /<NpmPackageTable[\s\S]*npmManagement\.environment\.title/);
    assert.match(source, /BatchSyncLogPanel batchSyncState=\{batchSyncState\}[\s\S]*npmManagement\.environment\.title/);
    assert.match(source, /\{shouldPromoteHagiscriptCard && hagiscriptCard\}/);
    assert.match(source, /\{!shouldPromoteHagiscriptCard && hagiscriptCard\}/);
  });

  it('uses row background colors instead of a dedicated status column for managed packages', async () => {
    const [modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(modelSource, /status === 'installed'\s*\?\s*'bg-emerald-500\/10 hover:bg-emerald-500\/15'/);
    assert.match(modelSource, /:\s*'bg-red-500\/10 hover:bg-red-500\/15'/);
    assert.match(packageGroupsSource, /className=\{cn\(managedPackageRowClassName\(item\.status\)/);
    assert.doesNotMatch(packageGroupsSource, /<TableHead>\{t\('npmManagement\.packageTable\.status'\)\}<\/TableHead>/);
  });

  it('only renders the uninstall action when a managed package is actually removable', async () => {
    const source = await fs.readFile(packageGroupsPath, 'utf8');

    assert.match(source, /\{canUninstall && \(/);
    assert.match(source, /onRunOperation\(item\.id, 'uninstall'\)/);
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
