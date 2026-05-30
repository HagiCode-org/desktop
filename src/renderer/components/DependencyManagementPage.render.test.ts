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
    assert.match(appSource, /import DependencyManagementPage from '\.\/components\/DependencyManagementPage';/);
    assert.match(appSource, /\{currentView === 'dependency-management' && <DependencyManagementPage \/>\}/);
  });

  it('loads snapshots, wires repair intent handling, and renders the package table with shared helpers', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /getDependencyManagementBridge\(\)\.getSnapshot\(\)/);
    assert.match(pageSource, /useSelector\(\(state: RootState\) => state\.view\.dependencyManagementIntent\)/);
    assert.match(pageSource, /evaluateDependencyRepairIntent\(/);
    assert.match(pageSource, /dispatch\(setDependencyManagementIntent\(null\)\)/);
    assert.match(pageSource, /dispatch\(switchView\(repairIntent\.returnView\)\)/);
    assert.match(pageSource, /getSelectablePackageIds\(managedPackages, \{ actionsDisabled \}\)/);
    assert.match(pageSource, /getSelectedEligiblePackageIds\(selectedPackageIds, selectablePackageIds\)/);
    assert.match(pageSource, /getSelectAllChecked\(selectedPackageIds, selectablePackageIds\)/);
    assert.match(pageSource, /pruneSelectedPackageIds\(current, snapshot\.packages\)/);

    assert.match(modelSource, /export function appendBatchSyncLog/);
    assert.match(modelSource, /export function getSelectablePackageIds/);
    assert.match(modelSource, /export function prioritizePackagesForRepair/);
    assert.match(modelSource, /export function evaluateDependencyRepairIntent/);
    assert.match(modelSource, /export function managedPackageRowClassName/);
    assert.match(modelSource, /item\.status !== 'unknown'/);

    assert.match(packageGroupsSource, /export function NpmPackageTable/);
    assert.match(packageGroupsSource, /dependencyManagement\.packageTable\.title/);
    assert.match(packageGroupsSource, /dependencyManagement\.selection\.selectPackage/);
    assert.match(packageGroupsSource, /dependencyManagement\.actions\.\$\{actionKey\}/);
    assert.match(packageGroupsSource, /const canUninstall = item\.status === 'installed' && item\.definition\.required !== true;/);
  });

  it('routes single-package and batch sync output into the shared log panel', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /setBatchSyncState\(\{\s*packageIds: \[packageId\],\s*status: 'running',\s*logs: \[\],\s*\}\);/);
    assert.match(pageSource, /const packageIds = selectedEligibleIds;/);
    assert.match(pageSource, /getDependencyManagementBridge\(\)\.syncPackages\(\{ packageIds \}\)/);
    assert.match(pageSource, /current && current\.packageIds\.length === 1 && current\.packageIds\[0\] === packageId/);
    assert.match(modelSource, /batchSyncState\s*&& batchSyncState\.packageIds\.includes\(event\.packageId\)/);
    assert.match(packageGroupsSource, /const usesBatchSyncPanel = batchSyncPackageIds\.has\(item\.id\);/);
    assert.match(packageGroupsSource, /!usesBatchSyncPanel && isActive/);
    assert.match(packageGroupsSource, /!usesBatchSyncPanel && itemProgress\?\.stage === 'completed'/);
    assert.match(packageGroupsSource, /export const BatchSyncLogPanel = forwardRef/);
  });

  it('renders vendored runtime cards with Desktop-managed actions and activation progress', async () => {
    const [pageSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /const unsubscribeActivation = bridge\.onVendoredRuntimeActivationProgress/);
    assert.match(pageSource, /enableVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /startVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /stopVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /restartVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /repairVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /<VendoredRuntimeCard/);

    assert.match(packageGroupsSource, /dependencyManagement\.vendoredRuntime\.actions\.enable/);
    assert.match(packageGroupsSource, /dependencyManagement\.vendoredRuntime\.actions\.reinstallDesktop/);
    assert.match(packageGroupsSource, /item\.status === 'extracting'/);
    assert.match(packageGroupsSource, /dependencyManagement\.vendoredRuntime\.activationStage\.\$\{item\.activation\.stage\}/);
    assert.match(packageGroupsSource, /onOpenRuntimeRoot/);
  });

  it('removes the legacy hagiscript bootstrap card and selector-based install contract', async () => {
    const [pageSource, modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.doesNotMatch(pageSource, /<NpmPackageBootstrapCard/);
    assert.doesNotMatch(pageSource, /hagiscriptGateOpen/);
    assert.doesNotMatch(pageSource, /shouldPromoteHagiscriptCard/);
    assert.doesNotMatch(packageGroupsSource, /DependencyManagementInstallRequest/);
    assert.doesNotMatch(packageGroupsSource, /dependencyGateMessage/);
    assert.doesNotMatch(packageGroupsSource, /export function NpmPackageBootstrapCard/);
    assert.doesNotMatch(modelSource, /hagiscriptGateOpen/);
    assert.match(pageSource, /getDependencyManagementBridge\(\)\.install\(packageId\)/);
  });

  it('keeps row-based status styling and disables selections only for unavailable actions or unknown packages', async () => {
    const [modelSource, packageGroupsSource] = await Promise.all([
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(modelSource, /displayStatus === 'installed'\s*\)\s*\{\s*return 'bg-emerald-500\/10 hover:bg-emerald-500\/15';/);
    assert.match(modelSource, /displayStatus === 'outdated'\s*\)\s*\{\s*return 'bg-amber-500\/10 hover:bg-amber-500\/15';/);
    assert.match(modelSource, /return 'bg-red-500\/10 hover:bg-red-500\/15';/);
    assert.match(packageGroupsSource, /disabled=\{actionsDisabled \|\| isBatchSyncRunning \|\| selectedEligibleCount === 0\}/);
    assert.match(packageGroupsSource, /const rowDisabled = actionsDisabled \|\| item\.status === 'unknown';/);
    assert.match(packageGroupsSource, /disabled=\{actionsDisabled \|\| selectablePackageIds\.length === 0\}/);
    assert.doesNotMatch(packageGroupsSource, /disabled=\{!hagiscriptGateOpen/);
  });

  it('renders mirror acceleration controls with optimistic updates and rollback on failure', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /dependencyManagement\.mirror\.title/);
    assert.match(source, /dependencyManagement\.mirror\.toggleLabel/);
    assert.match(source, /dependencyManagement\.mirror\.registryUrl/);
    assert.match(source, /dependencyManagement\.mirror\.enabledHelp/);
    assert.match(source, /dependencyManagement\.mirror\.disabledHelp/);
    assert.match(source, /getDependencyManagementBridge\(\)\.setMirrorSettings\(\{ enabled \}\)/);
    assert.match(source, /setSnapshot\(previousSnapshot\)/);
    assert.match(source, /const mirrorToggleDisabled = isSavingMirrorSettings \|\| Boolean\(activePackageId\)/);
  });

  it('wires the batch log panel as the scroll target when a batch starts', async () => {
    const [pageSource, packageGroupsSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(packageGroupsPath, 'utf8'),
    ]);

    assert.match(pageSource, /const batchLogPanelRef = useRef<HTMLDivElement \| null>\(null\);/);
    assert.match(pageSource, /batchLogPanelRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\);/);
    assert.match(pageSource, /<BatchSyncLogPanel ref=\{batchLogPanelRef\} batchSyncState=\{batchSyncState\}/);
    assert.match(packageGroupsSource, /<Card ref=\{ref\}>/);
  });

  it('generates updated localized dependency management strings', async () => {
    await ensureGeneratedLocales();

    const [zh, en] = await Promise.all([
      fs.readFile(zhLocalePath, 'utf8'),
      fs.readFile(enLocalePath, 'utf8'),
    ]);
    const zhJson = JSON.parse(zh) as Record<string, any>;
    const enJson = JSON.parse(en) as Record<string, any>;

    assert.equal(zhJson.sidebar.dependencyManagement, '依赖项管理');
    assert.equal(enJson.sidebar.dependencyManagement, 'Dependency Management');
    assert.equal(zhJson.dependencyManagement.packageTable.description, '选择 Agent CLI 与工作流依赖项，通过 Desktop SDK 的 npm 同步流程安装。');
    assert.equal(enJson.dependencyManagement.packageTable.description, 'Select Agent CLI and workflow dependencies to install through the Desktop SDK npm sync flow.');
    assert.equal(zhJson.dependencyManagement.vendoredRuntime.primaryDescriptions.installed, '运行时文件已安装，并且符合最新的 Desktop 运行时契约。');
    assert.equal(enJson.dependencyManagement.vendoredRuntime.primaryDescriptions.installed, 'Runtime files are installed and matched the latest Desktop runtime contract.');
    assert.match(enJson.codeServer.dependencyGuidance.description, /Desktop-managed PM2/);
    assert.match(zhJson.codeServer.dependencyGuidance.description, /Desktop 托管的 PM2/);
  });
});
