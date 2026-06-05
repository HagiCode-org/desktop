import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import {
  buildDesktopNpmSyncManifest,
  buildInstalledGlobalPackagesFromDefinitions,
  getManagedPackageInstallTarget,
} from '../hagiscript-sync.js';
import { managedNpmPackages } from '../../shared/npm-managed-packages.js';
import { resolveCommandLaunch } from '../toolchain-launch.js';

const servicePath = path.resolve(process.cwd(), 'src/main/dependency-management-service.ts');
const catalogPath = path.resolve(process.cwd(), 'src/shared/npm-managed-packages.ts');
const runtimeManifestPath = path.resolve(process.cwd(), 'resources/manifest.yml');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('dependency management service contract', () => {
  it('keeps portable Node/npm activation policy handling in the main service', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /getDesktopActivationPolicy\(\)/);
    assert.match(source, /injectPortableToolchainEnv\(process\.env, this\.pathManager/);
    assert.match(source, /process\.env\.npm_node_execpath\?\.trim\(\) \|\| 'node'/);
    assert.match(source, /private async detectNpmVersion\(/);
    assert.match(source, /private runNpmCommand\(/);
    assert.match(source, /HAGICODE_PORTABLE_TOOLCHAIN_ROOT/);
  });

  it('routes managed package sync through the Desktop SDK instead of the legacy hagiscript CLI', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /createNpmSyncPlan/);
    assert.match(source, /syncNpmGlobals/);
    assert.match(source, /validateNpmSyncManifest/);
    assert.match(source, /private async runSdkSync\(/);
    assert.match(source, /buildDesktopNpmSyncManifest/);
    assert.match(source, /buildInstalledGlobalPackagesFromDefinitions/);
    assert.match(source, /buildSdkSyncNpmCommandOptions/);
    assert.match(source, /private async verifySdkNodeRuntime\(/);
    assert.match(source, /verifyRuntime: \(runtimePath, options\) => this\.verifySdkNodeRuntime\(runtimePath, activationPolicy, environment, options\)/);
    assert.match(source, /if \(!isJavaScriptCommandPath\(command\)\) \{/);
    assert.match(source, /args: \[command, \.\.\.args\]/);
    assert.match(source, /detectInstalledPackageFromInventory/);
    assert.match(source, /parseInstalledPackageInventoryEntry/);
    assert.match(source, /if \(!environment\.npmGlobalPrefix \|\| !this\.existsSync\(environment\.npmGlobalPrefix\)\) \{/);
    assert.match(source, /--json',\s*'--long',\s*'--depth=0'/);
    assert.doesNotMatch(source, /runHagiscriptSync/);
    assert.doesNotMatch(source, /buildHagiscriptSyncArgs/);
    assert.doesNotMatch(source, /validateHagiscriptDependency/);
  });

  it('injects pm2 into non-interactive sync verification while keeping requested package ids stable', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /addPackageId\('pm2'\);/);
    assert.match(source, /const syncPackageIds = this\.resolveCliSyncPackageIds\(requestedPackageIds\);/);
    assert.match(source, /const verificationPackageIds = syncPackageIds;/);
    assert.doesNotMatch(source, /bootstrapPerformed/);
  });

  it('defines the managed catalog without the legacy hagiscript bootstrap package', async () => {
    const source = await fs.readFile(catalogPath, 'utf8');

    assert.doesNotMatch(source, /id: 'hagiscript'/);
    assert.doesNotMatch(source, /category: 'bootstrap'/);
    assert.match(source, /id: 'openspec'/);
    assert.match(source, /id: 'skills'/);
    assert.match(source, /id: 'pm2'/);
    assert.match(source, /id: 'pm2'[\s\S]*required: true,/);
    assert.match(source, /installMode: 'sdk-sync'/);
    assert.match(source, /runtimeManagedPackageManifestPackages/);
    assert.match(source, /applyRuntimeManagedPackageOverride/);
  });

  it('keeps sync failure diagnostics without forcing Windows Store npm install overrides', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /Starting managed package sync/);
    assert.match(source, /npm command exited with code/);
    assert.match(source, /!isExpectedMissingPackageInspectionResult\(command, args, result\)/);
    assert.match(source, /private applyManagedNpmDebugOptionsEnv\(env: NodeJS\.ProcessEnv\): void \{/);
    assert.match(source, /configManager\.getDebugOptionsSettings\(\)/);
    assert.match(source, /env\.npm_config_ignore_scripts = 'true';/);
    assert.match(source, /env\.NPM_CONFIG_IGNORE_SCRIPTS = 'true';/);
    assert.doesNotMatch(source, /rewriteNpmInstallArgsForWindowsStore\(args: readonly string\[\]\)/);
    assert.doesNotMatch(source, /Applying Windows Store npm install override/);
    assert.doesNotMatch(source, /--ignore-scripts/);
    assert.doesNotMatch(source, /const installIndex = args\.findIndex\(\(value\) => value === 'install'\)/);
    assert.doesNotMatch(source, /const rewrittenArgs = this\.rewriteNpmInstallArgsForWindowsStore\(args\);/);
    assert.match(source, /const execution = this\.resolveSdkNpmCommandExecution\(command, args, activationPolicy, environment\);/);
    assert.match(source, /return isWindowsStoreRuntime\(\{/);
    assert.match(source, /processWindowsStore: Boolean\(\(process as NodeJS\.Process & \{ windowsStore\?: boolean \}\)\.windowsStore\)/);
    assert.match(source, /defaultApp: \(process as NodeJS\.Process & \{ defaultApp\?: boolean \}\)\.defaultApp/);
    assert.match(source, /applyWindowsStoreNpmOverrides\(env: NodeJS\.ProcessEnv\)/);
    assert.doesNotMatch(source, /WINDOWS_STORE_IGNORE_SCRIPTS_PACKAGE_NAMES/);
    assert.doesNotMatch(source, /matchesManagedPackageSelector/);
    assert.doesNotMatch(source, /npm_config_script_shell =/);
    assert.doesNotMatch(source, /NPM_CONFIG_SCRIPT_SHELL =/);
    assert.doesNotMatch(source, /env\.ComSpec =/);
    assert.doesNotMatch(source, /env\.COMSPEC =/);
  });

  it('adds configurable internal and external dependency management modes to the snapshot contract', async () => {
    const [source, typesSource] = await Promise.all([
      fs.readFile(servicePath, 'utf8'),
      fs.readFile(path.resolve(process.cwd(), 'src/types/dependency-management.ts'), 'utf8'),
    ]);

    assert.match(typesSource, /export type DependencyManagementMode = 'internal' \| 'external';/);
    assert.match(typesSource, /export interface DependencyManagementModeSettings/);
    assert.match(typesSource, /configuredMode: DependencyManagementMode;/);
    assert.match(typesSource, /effectiveMode: DependencyManagementMode;/);
    assert.match(typesSource, /mutationsAvailable: boolean;/);
    assert.match(typesSource, /mode: DependencyManagementModeSettings;/);
    assert.match(typesSource, /getModeSettings: \(\) => Promise<DependencyManagementModeSettings>;/);
    assert.match(typesSource, /setMode: \(mode: DependencyManagementMode\) => Promise<DependencyManagementSnapshot>;/);
    assert.match(source, /private resolveModeSettings\(\): DependencyManagementModeSettings/);
    assert.match(source, /const isWinStore = this\.isWindowsStoreExecutionEnvironment\(\);/);
    assert.match(source, /const configuredMode = this\.configManager\.getDependencyManagementMode\(isWinStore\);/);
    assert.match(source, /const effectiveMode: DependencyManagementMode = configuredMode;/);
    assert.match(source, /mutationsAvailable: effectiveMode === 'internal'/);
    assert.match(source, /readOnlyReason: effectiveMode === 'external'/);
    assert.doesNotMatch(source, /lockedByRuntime:/);
    assert.doesNotMatch(source, /Windows Store packaging requires external read-only dependency management\./);
    assert.match(source, /const mode = this\.resolveModeSettings\(\);/);
    assert.match(source, /return this\.getSnapshot\(\);/);
  });

  it('uses external global npm inspection and rejects mutations in external mode', async () => {
    const [source, handlersSource, preloadSource] = await Promise.all([
      fs.readFile(servicePath, 'utf8'),
      fs.readFile(path.resolve(process.cwd(), 'src/main/ipc/handlers/dependencyManagementHandlers.ts'), 'utf8'),
      fs.readFile(preloadPath, 'utf8'),
    ]);

    assert.match(source, /private buildExternalCommandEnv\(\): NodeJS\.ProcessEnv/);
    assert.match(source, /private async detectExternalEnvironment\(\): Promise<DependencyManagementEnvironmentStatus>/);
    assert.match(source, /source: 'externally-managed'/);
    assert.match(source, /resolveExternalNpmGlobalPrefix/);
    assert.match(source, /resolveExternalNpmGlobalModulesRoot/);
    assert.match(source, /resolveExternalNpmCacheRoot/);
    assert.match(source, /if \(!mode\.mutationsAvailable\) \{/);
    assert.match(source, /error: mode\.readOnlyReason \?\? 'External dependency mode is read-only\.'/);
    assert.match(source, /environment\.source === 'desktop-managed'/);
    assert.match(handlersSource, /dependencyManagementChannels\.getModeSettings/);
    assert.match(handlersSource, /dependencyManagementChannels\.setMode/);
    assert.match(preloadSource, /getModeSettings: \(\) => ipcRenderer\.invoke\(dependencyManagementChannels\.getModeSettings\)/);
    assert.match(preloadSource, /setMode: \(mode: DependencyManagementMode\) => ipcRenderer\.invoke\(dependencyManagementChannels\.setMode, mode\)/);
  });

  it('logs syncPackages IPC entrypoints for dependency management requests', async () => {
    const handlersSource = await fs.readFile(
      path.resolve(process.cwd(), 'src/main/ipc/handlers/dependencyManagementHandlers.ts'),
      'utf8',
    );

    assert.match(handlersSource, /\[DependencyManagementHandlers\] syncPackages requested/);
  });
});

describe('Desktop npm sync manifest helpers', () => {
  it('reads manifest-backed package versions from resources/manifest.yml', async () => {
    const manifest = load(await fs.readFile(runtimeManifestPath, 'utf8')) as {
      npmSync?: {
        packages?: Record<string, { version?: string; target?: string }>;
      };
    };
    const manifestPackages = manifest.npmSync?.packages ?? {};

    const claude = managedNpmPackages.find((item) => item.id === 'claude-code');
    const codex = managedNpmPackages.find((item) => item.id === 'codex');
    const openspec = managedNpmPackages.find((item) => item.id === 'openspec');
    const skills = managedNpmPackages.find((item) => item.id === 'skills');

    assert.ok(claude);
    assert.ok(codex);
    assert.ok(openspec);
    assert.ok(skills);

    assert.equal(claude.installSpec, `@anthropic-ai/claude-code@${manifestPackages['@anthropic-ai/claude-code']?.target}`);
    assert.equal(claude.requiredVersionRange, manifestPackages['@anthropic-ai/claude-code']?.version);
    assert.equal(codex.installSpec, `@openai/codex@${manifestPackages['@openai/codex']?.target}`);
    assert.equal(codex.requiredVersionRange, manifestPackages['@openai/codex']?.version);
    assert.equal(openspec.installSpec, `@fission-ai/openspec@${manifestPackages['@fission-ai/openspec']?.target}`);
    assert.equal(openspec.requiredVersionRange, manifestPackages['@fission-ai/openspec']?.version);
    assert.equal(skills.installSpec, `skills@${manifestPackages.skills?.target}`);
    assert.equal(skills.requiredVersionRange, manifestPackages.skills?.version);
  });

  it('derives npm install selectors from managed package definitions', () => {
    const claude = managedNpmPackages.find((item) => item.id === 'claude-code');
    const pm2 = managedNpmPackages.find((item) => item.id === 'pm2');
    const codex = managedNpmPackages.find((item) => item.id === 'codex');
    assert.ok(claude);
    assert.ok(pm2);
    assert.ok(codex);

    assert.equal(getManagedPackageInstallTarget(claude), '2.1.159');
    assert.equal(getManagedPackageInstallTarget(pm2), '7.0.1');
    assert.equal(getManagedPackageInstallTarget(codex), '0.135.0');
  });

  it('builds an SDK-compatible sync manifest from managed package definitions', () => {
    const definitions = managedNpmPackages.filter((item) =>
      item.id === 'openspec' || item.id === 'claude-code' || item.id === 'pm2' || item.id === 'codex');
    const manifest = buildDesktopNpmSyncManifest(definitions, 'https://registry.npmmirror.com/');

    assert.equal(manifest.syncMode, 'packages');
    assert.equal(manifest.registryMirror, 'https://registry.npmmirror.com/');
    assert.deepEqual(manifest.packages['@fission-ai/openspec'], { version: '1.3.1', target: '1.3.1' });
    assert.deepEqual(manifest.packages['@anthropic-ai/claude-code'], { version: '2.1.159', target: '2.1.159' });
    assert.deepEqual(manifest.packages.pm2, { version: '>=7.0.1', target: '7.0.1' });
    assert.deepEqual(manifest.packages['@openai/codex'], { version: '0.135.0', target: '0.135.0' });
  });

  it('maps installed package snapshots into the SDK inventory shape', () => {
    const definitions = managedNpmPackages.filter((item) => item.id === 'pm2' || item.id === 'codex');
    const inventory = buildInstalledGlobalPackagesFromDefinitions(definitions, {
      pm2: '7.0.1',
      '@openai/codex': '0.27.0',
    });

    assert.deepEqual(inventory, {
      pm2: '7.0.1',
      '@openai/codex': '0.27.0',
    });
  });
});

describe('Windows command launch contract', () => {
  it('keeps .cmd wrappers on the shell-aware launch path for Program Files installs', () => {
    const launch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\npm.cmd',
      'win32',
    );

    assert.equal(launch.command, '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\npm.cmd"');
    assert.equal(launch.shell, true);
  });
});
