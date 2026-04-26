import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/DependencyManagementPage.tsx');
const modelPath = path.resolve(process.cwd(), 'src/renderer/components/dependency-management/dependencyManagementPageModel.ts');
const packageGroupsPath = path.resolve(process.cwd(), 'src/renderer/components/dependency-management/NpmPackageGroups.tsx');
const zhLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/common.json');
const enLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/common.json');

describe('dependency management renderer wiring', () => {
  it('adds the first-level sidebar item and renders the page from App', async () => {
    const [sidebarSource, appSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
    ]);

    assert.match(sidebarSource, /\{ id: 'dependency-management', labelKey: 'sidebar\.dependencyManagement', icon: PackageOpen \}/);
    assert.match(sidebarSource, />\s*Hagicode\s*</);
    assert.match(appSource, /import DependencyManagementPage from '\.\/components\/DependencyManagementPage';/);
    assert.match(appSource, /\{currentView === 'dependency-management' && <DependencyManagementPage \/>\}/);
  });

  it('keeps page behavior for loading, unavailable states, package rows, progress, batch logs, and inline errors', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /getDependencyManagementBridge\(\)\.getSnapshot\(\)/);
    assert.match(pageSource, /environment\.available/);
    assert.match(pageSource, /dependencyManagement\.environment\.rationaleTitle/);
    assert.match(pageSource, /dependencyManagement\.environment\.rationale\.fixedRuntime/);
    assert.match(pageSource, /dependencyManagement\.environment\.rationale\.isolatedConfig/);
    assert.match(pageSource, /dependencyManagement\.environment\.rationale\.nonIntrusive/);
    assert.match(modelSource, /managedPackageRowClassName/);
    assert.match(packageGroupsSource, /packages\.map/);
    assert.match(packageGroupsSource, /const canUninstall = item\.status === 'installed' && item\.definition\.required !== true;/);
    assert.match(packageGroupsSource, /Progress value=\{itemProgress\?\.percentage \?\? 20\}/);
    assert.match(pageSource, /batchSyncState/);
    assert.match(packageGroupsSource, /BatchSyncLogPanel/);
    assert.match(packageGroupsSource, /usesBatchSyncPanel/);
    assert.match(packageGroupsSource, /operationErrorByPackageId\[item\.id\]/);
  });

  it('keeps extracted dependency management helpers and package group components wired into the page', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /from '\.\/dependency-management\/dependencyManagementPageModel'/);
    assert.match(pageSource, /from '\.\/dependency-management\/NpmPackageGroups'/);
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
    assert.match(packageGroupsSource, /dependencyManagement\.packageTable\.title/);
    assert.match(packageGroupsSource, /dependencyManagement\.selection\.selectPackage/);
    assert.match(packageGroupsSource, /dependencyManagement\.batchLog\.title/);
  });

  it('renders the hagiscript bootstrap card and gated selectable package table', async () => {
    const [pageSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /item\.id === 'hagiscript'/);
    assert.match(packageGroupsSource, /dependencyManagement\.bootstrap\.title/);
    assert.match(pageSource, /hagiscriptGateOpen/);
    assert.match(packageGroupsSource, /dependencyGateMessage/);
    assert.match(packageGroupsSource, /dependencyManagement\.packageTable\.title/);
    assert.match(packageGroupsSource, /Checkbox/);
    assert.match(pageSource, /selectedPackageIds/);
    assert.match(pageSource, /toggleSelectAll/);
    assert.match(pageSource, /shouldPromoteHagiscriptCard/);
    assert.match(pageSource, /getDependencyManagementBridge\(\)\.syncPackages\(\{ packageIds \}\)/);
    assert.match(packageGroupsSource, /dependencyManagement\.batchLog\.title/);
    assert.match(packageGroupsSource, /dependencyManagement\.batchLog\.status\./);
    assert.match(packageGroupsSource, /dependencyManagement\.categories\.\$\{item\.definition\.category\}/);
  });

  it('places the package table and batch log section before environment details while conditionally promoting the hagiscript card', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /<NpmPackageTable[\s\S]*dependencyManagement\.environment\.title/);
    assert.match(source, /BatchSyncLogPanel batchSyncState=\{batchSyncState\}[\s\S]*dependencyManagement\.environment\.title/);
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
    assert.doesNotMatch(packageGroupsSource, /<TableHead>\{t\('dependencyManagement\.packageTable\.status'\)\}<\/TableHead>/);
  });

  it('only renders the uninstall action when a managed package is actually removable', async () => {
    const source = await fs.readFile(packageGroupsPath, 'utf8');

    assert.match(source, /\{canUninstall && \(/);
    assert.match(source, /onRunOperation\(item\.id, 'uninstall'\)/);
    assert.doesNotMatch(source, /disabled=\{rowDisabled \|\| item\.status !== 'installed' \|\| item\.definition\.required === true\}/);
  });

  it('renders mirror acceleration controls with save, revert, and disabled states', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /dependencyManagement\.mirror\.title/);
    assert.match(source, /dependencyManagement\.mirror\.toggleLabel/);
    assert.match(source, /dependencyManagement\.mirror\.registryUrl/);
    assert.match(source, /dependencyManagement\.mirror\.enabled/);
    assert.match(source, /dependencyManagement\.mirror\.disabled/);
    assert.match(source, /dependencyManagement\.mirror\.saving/);
    assert.match(source, /dependencyManagement\.mirror\.saveFailed/);
    assert.match(source, /getDependencyManagementBridge\(\)\.setMirrorSettings\(\{ enabled \}\)/);
    assert.match(source, /setSnapshot\(previousSnapshot\)/);
    assert.match(source, /const mirrorToggleDisabled = isSavingMirrorSettings \|\| Boolean\(activePackageId\)/);
  });

  it('adds zh-CN and en-US localization keys', async () => {
    const [zh, en] = await Promise.all([
      fs.readFile(zhLocalePath, 'utf8'),
      fs.readFile(enLocalePath, 'utf8'),
    ]);

    assert.equal(JSON.parse(zh).sidebar.dependencyManagement, '依赖项管理');
    assert.equal(JSON.parse(en).sidebar.dependencyManagement, 'Dependency Management');
    assert.equal(typeof JSON.parse(zh).dependencyManagement.environment.status.available, 'string');
    assert.equal(typeof JSON.parse(zh).dependencyManagement.environment.rationaleTitle, 'string');
    assert.equal(typeof JSON.parse(zh).dependencyManagement.environment.rationale.fixedRuntime, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.environment.rationale.isolatedConfig, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.environment.rationale.nonIntrusive, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.actions.install, 'string');
    assert.equal(JSON.parse(en).dependencyManagement.categories['agent-cli'], 'Agent CLI');
    assert.equal(typeof JSON.parse(en).dependencyManagement.packages.claudeCode.description, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.packages.codex.description, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.packages.githubCopilot.description, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.packages.opencode.description, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.packages.qoder.description, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.packages.gemini.description, 'string');
    assert.equal(typeof JSON.parse(zh).dependencyManagement.dependencyGate.missing, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.batchLog.title, 'string');
    assert.equal(typeof JSON.parse(zh).dependencyManagement.batchLog.status.running, 'string');
    assert.equal(typeof JSON.parse(zh).dependencyManagement.selection.selectedCount, 'string');
    assert.equal(JSON.parse(zh).dependencyManagement.mirror.title, 'npm 镜像加速');
    assert.equal(JSON.parse(en).dependencyManagement.mirror.registryUrl, 'Registry URL');
    assert.equal(typeof JSON.parse(zh).dependencyManagement.mirror.saveFailed, 'string');
    assert.equal(typeof JSON.parse(en).dependencyManagement.mirror.enabledHelp, 'string');
  });
});
