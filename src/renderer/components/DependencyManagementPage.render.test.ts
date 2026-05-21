import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ensureGeneratedLocales } from '../test-utils/ensure-generated-locales.mjs';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/DependencyManagementPage.tsx');
const modelPath = path.resolve(process.cwd(), 'src/renderer/components/dependency-management/dependencyManagementPageModel.ts');
const packageGroupsPath = path.resolve(process.cwd(), 'src/renderer/components/dependency-management/NpmPackageGroups.tsx');
const zhLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/zh-CN/common.json');
const enLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/en-US/common.json');

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
    assert.match(pageSource, /dependencyManagement\.environment\.faqUrl/);
    assert.match(pageSource, /dependencyManagement\.environment\.faqLinkLabel/);
    assert.match(pageSource, /openExternal/);
    assert.match(modelSource, /managedPackageRowClassName/);
    assert.match(modelSource, /isManagedPackageOutdated/);
    assert.match(modelSource, /getManagedPackageDisplayStatus/);
    assert.match(modelSource, /prioritizePackagesForRepair/);
    assert.match(modelSource, /evaluateDependencyRepairIntent/);
    assert.match(packageGroupsSource, /packages\.map/);
    assert.match(packageGroupsSource, /const canUninstall = item\.status === 'installed' && item\.definition\.required !== true;/);
    assert.match(packageGroupsSource, /highlightedPackageIds\?: ManagedNpmPackageId\[];/);
    assert.match(packageGroupsSource, /dependencyManagement\.omniRouteRepair\.targetBadge/);
    assert.match(packageGroupsSource, /dependencyManagement\.packageStatus\.\$\{displayStatus\}/);
    assert.match(packageGroupsSource, /dependencyManagement\.package\.versionMismatch/);
    assert.match(packageGroupsSource, /Progress value=\{itemProgress\?\.percentage \?\? 20\}/);
    assert.match(pageSource, /batchSyncState/);
    assert.match(packageGroupsSource, /BatchSyncLogPanel/);
    assert.match(packageGroupsSource, /usesBatchSyncPanel/);
    assert.match(packageGroupsSource, /operationErrorByPackageId\[item\.id\]/);
  });

  it('routes single-package install and uninstall logs into the shared log panel instead of rendering row-level log output', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /setBatchSyncState\(\{\s*packageIds: \[packageId\],\s*status: 'running',\s*logs: \[\],\s*\}\);/);
    assert.match(pageSource, /current\.packageIds\.length === 1 && current\.packageIds\[0\] === packageId/);
    assert.match(modelSource, /batchSyncState\s*&& batchSyncState\.packageIds\.includes\(event\.packageId\)/);
    assert.doesNotMatch(modelSource, /event\.operation === 'sync'/);
    assert.match(packageGroupsSource, /const itemProgress = progressByPackageId\[item\.id\]\s*\?\?\s*\(activeOperation\?\.packageId === item\.id \? activeOperation : undefined\);/);
    assert.match(packageGroupsSource, /!\s*usesBatchSyncPanel && isActive/);
    assert.match(packageGroupsSource, /!\s*usesBatchSyncPanel && itemProgress\?\.stage === 'completed'/);
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
    assert.match(pageSource, /useSelector\(\(state: RootState\) => state\.view\.dependencyManagementIntent\)/);
    assert.match(pageSource, /runRepairCompletionCheck/);
    assert.match(pageSource, /dependencyManagement\.omniRouteRepair\.recheckAction/);
    assert.match(pageSource, /dispatch\(setDependencyManagementIntent\(null\)\)/);
    assert.match(pageSource, /dispatch\(switchView\(repairIntent\.returnView\)\)/);
    assert.match(pageSource, /<NpmPackageBootstrapCard/);
    assert.match(pageSource, /<NpmPackageTable/);
    assert.match(pageSource, /<BatchSyncLogPanel ref=\{batchLogPanelRef\} batchSyncState=\{batchSyncState\}/);

    assert.match(modelSource, /export function isOperationActive/);
    assert.match(modelSource, /export function appendBatchSyncLog/);
    assert.match(modelSource, /export function getSelectablePackageIds/);
    assert.match(modelSource, /export function prioritizePackagesForRepair/);
    assert.match(modelSource, /export function evaluateDependencyRepairIntent/);
    assert.match(modelSource, /export function getManagedPackageActionKey/);
    assert.match(modelSource, /export function updateSelectedPackageIds/);
    assert.match(modelSource, /export function managedPackageRowClassName/);

    assert.match(packageGroupsSource, /export function NpmPackageBootstrapCard/);
    assert.match(packageGroupsSource, /export function NpmPackageTable/);
    assert.match(packageGroupsSource, /export const BatchSyncLogPanel = forwardRef/);
    assert.match(packageGroupsSource, /dependencyManagement\.packageTable\.title/);
    assert.match(packageGroupsSource, /dependencyManagement\.selection\.selectPackage/);
    assert.match(packageGroupsSource, /dependencyManagement\.actions\.\$\{actionKey\}/);
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

    assert.match(source, /dependencyManagement\.omniRouteRepair\.title[\s\S]*<NpmPackageTable/);
    assert.match(source, /<NpmPackageTable[\s\S]*dependencyManagement\.environment\.title/);
    assert.match(source, /BatchSyncLogPanel ref=\{batchLogPanelRef\} batchSyncState=\{batchSyncState\}[\s\S]*dependencyManagement\.environment\.title/);
    assert.match(source, /\{shouldPromoteHagiscriptCard && hagiscriptCard\}/);
    assert.match(source, /\{!shouldPromoteHagiscriptCard && hagiscriptCard\}/);
  });

  it('uses row background colors instead of a dedicated status column for managed packages', async () => {
    const [modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(modelSource, /displayStatus === 'installed'\s*\)\s*\{\s*return 'bg-emerald-500\/10 hover:bg-emerald-500\/15';/);
    assert.match(modelSource, /displayStatus === 'outdated'\s*\)\s*\{\s*return 'bg-amber-500\/10 hover:bg-amber-500\/15';/);
    assert.match(modelSource, /return 'bg-red-500\/10 hover:bg-red-500\/15';/);
    assert.match(packageGroupsSource, /className=\{cn\(\s*managedPackageRowClassName\(item\)/);
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

  it('disables the batch install action and shows localized loading feedback while batch sync is running', async () => {
    const [pageSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /const isBatchSyncRunning = batchSyncState\?\.status === 'running';/);
    assert.match(pageSource, /isBatchSyncRunning=\{isBatchSyncRunning\}/);
    assert.match(packageGroupsSource, /isBatchSyncRunning: boolean;/);
    assert.match(packageGroupsSource, /disabled=\{!hagiscriptGateOpen \|\| actionsDisabled \|\| isBatchSyncRunning \|\| selectedEligibleCount === 0\}/);
    assert.match(packageGroupsSource, /isBatchSyncRunning \? <Loader2 className="mr-2 h-4 w-4 animate-spin" \/> : <PackageOpen className="mr-2 h-4 w-4" \/>/);
    assert.match(packageGroupsSource, /isBatchSyncRunning \? t\('dependencyManagement\.actions\.installSelectedRunning'\) : t\('dependencyManagement\.actions\.installSelected'\)/);
  });

  it('reconciles install results from returned snapshots so hagiscript unlocks dependent package actions without refresh', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /applySnapshot\(result\.snapshot\);/);
    assert.match(pageSource, /if \(!result\.success\) \{/);
    assert.match(pageSource, /setOperationError\(\(current\) => \(\{ \.\.\.current, \[packageId\]: undefined \}\)\);/);
    assert.match(pageSource, /hagiscript\?\.status === 'installed' && Boolean\(hagiscript\.executablePath\)/);
    assert.match(pageSource, /getSelectablePackageIds\(managedPackages, \{ hagiscriptGateOpen, actionsDisabled \}\)/);
    assert.match(modelSource, /export function getInstallEligiblePackageIds/);
    assert.match(modelSource, /options\.hagiscriptGateOpen && item\.status !== 'unknown'/);
    assert.match(packageGroupsSource, /disabled=\{rowDisabled\}/);
  });

  it('keeps failed install and sync results visible while preserving disabled dependent actions', async () => {
    const [pageSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /applySnapshot\(result\.snapshot\);/);
    assert.match(pageSource, /\[packageId\]: result\.error \?\? t\('dependencyManagement\.errors\.operationFailed'\)/);
    assert.match(pageSource, /status: 'failed', error: result\.error \?\? t\('dependencyManagement\.errors\.operationFailed'\)/);
    assert.match(packageGroupsSource, /!hagiscriptGateOpen && \(/);
    assert.match(packageGroupsSource, /dependencyGateMessage/);
    assert.match(packageGroupsSource, /\{batchSyncState\.error && \(/);
  });

  it('uses refreshed batch sync rows to complete the batch and prunes stale selected package ids', async () => {
    const [pageSource, modelSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
    ]);

    assert.match(pageSource, /const packageIds = selectedEligibleIds;/);
    assert.match(pageSource, /applySnapshot\(result\.snapshot\);/);
    assert.match(pageSource, /status: 'completed', error: undefined/);
    assert.match(pageSource, /setSelectedPackageIds\(\[\]\);/);
    assert.match(pageSource, /pruneSelectedPackageIds\(current, nextManagedPackages/);
    assert.match(modelSource, /export function pruneSelectedPackageIds/);
    assert.match(modelSource, /const eligibleIds = new Set\(getInstallEligiblePackageIds\(packages, options\)\);/);
  });

  it('wires the batch log panel as the scroll target when batch sync starts', async () => {
    const [pageSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /const batchLogPanelRef = useRef<HTMLDivElement \| null>\(null\);/);
    assert.match(pageSource, /batchLogPanelRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\);/);
    assert.match(pageSource, /\}, \[isBatchSyncRunning\]\);/);
    assert.match(packageGroupsSource, /forwardRef<HTMLDivElement, \{ batchSyncState: BatchSyncState \}>/);
    assert.match(packageGroupsSource, /<Card ref=\{ref\}>/);
  });

  it('adds zh-CN and en-US localization keys', async () => {
    await ensureGeneratedLocales();

    const [zh, en] = await Promise.all([
      fs.readFile(zhLocalePath, 'utf8'),
      fs.readFile(enLocalePath, 'utf8'),
    ]);
    const zhJson = JSON.parse(zh) as Record<string, any>;
    const enJson = JSON.parse(en) as Record<string, any>;

    assert.equal(zhJson.sidebar.dependencyManagement, '依赖项管理');
    assert.equal(enJson.sidebar.dependencyManagement, 'Dependency Management');
    assert.equal(typeof zhJson.dependencyManagement.environment.status.available, 'string');
    assert.equal(typeof zhJson.dependencyManagement.environment.rationaleTitle, 'string');
    assert.equal(zhJson.dependencyManagement.environment.faqUrl, 'https://docs.hagicode.com/faq/desktop-node-environment/');
    assert.equal(enJson.dependencyManagement.environment.faqUrl, 'https://docs.hagicode.com/en/faq/desktop-node-environment/');
    assert.equal(typeof enJson.dependencyManagement.actions.install, 'string');
    assert.equal(zhJson.dependencyManagement.actions.installSelectedRunning, '正在批量安装...');
    assert.equal(enJson.dependencyManagement.actions.installSelectedRunning, 'Batch installing...');
    assert.equal(enJson.dependencyManagement.categories['agent-cli'], 'Agent CLI');
    assert.equal(typeof enJson.dependencyManagement.packages.claudeCode.description, 'string');
    assert.equal(typeof enJson.dependencyManagement.packages.codex.description, 'string');
    assert.equal(typeof enJson.dependencyManagement.packages.githubCopilot.description, 'string');
    assert.equal(typeof enJson.dependencyManagement.packages.opencode.description, 'string');
    assert.equal(typeof enJson.dependencyManagement.packages.qoder.description, 'string');
    assert.equal(typeof enJson.dependencyManagement.packages.gemini.description, 'string');
    assert.equal(typeof enJson.dependencyManagement.packages.impeccable.description, 'string');
    assert.equal(typeof zhJson.dependencyManagement.dependencyGate.missing, 'string');
    assert.equal(typeof enJson.dependencyManagement.batchLog.title, 'string');
    assert.equal(typeof zhJson.dependencyManagement.batchLog.status.running, 'string');
    assert.equal(typeof zhJson.dependencyManagement.selection.selectedCount, 'string');
    assert.equal(zhJson.dependencyManagement.mirror.title, 'npm 镜像加速');
    assert.equal(typeof zhJson.dependencyManagement.omniRouteRepair.recheckAction, 'string');
    assert.equal(enJson.dependencyManagement.mirror.registryUrl, 'Registry URL');
    assert.equal(typeof zhJson.dependencyManagement.mirror.saveFailed, 'string');
    assert.equal(typeof enJson.dependencyManagement.mirror.enabledHelp, 'string');
    assert.equal(typeof enJson.dependencyManagement.omniRouteRepair.targetBadge, 'string');
    assert.equal(typeof enJson.dependencyManagement.vendoredRuntime.installStatus.installed, 'string');
    assert.equal(typeof zhJson.dependencyManagement.vendoredRuntime.runtimeState, 'string');
  });
});
