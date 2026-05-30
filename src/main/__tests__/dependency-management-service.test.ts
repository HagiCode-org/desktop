import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildDesktopNpmSyncManifest,
  buildInstalledGlobalPackagesFromDefinitions,
  getManagedPackageInstallTarget,
} from '../hagiscript-sync.js';
import { managedNpmPackages } from '../../shared/npm-managed-packages.js';
import { resolveCommandLaunch } from '../toolchain-launch.js';

const servicePath = path.resolve(process.cwd(), 'src/main/dependency-management-service.ts');
const catalogPath = path.resolve(process.cwd(), 'src/shared/npm-managed-packages.ts');

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
    assert.match(source, /installMode: 'sdk-sync'/);
  });
});

describe('Desktop npm sync manifest helpers', () => {
  it('derives npm install selectors from managed package definitions', () => {
    const pm2 = managedNpmPackages.find((item) => item.id === 'pm2');
    const codex = managedNpmPackages.find((item) => item.id === 'codex');
    assert.ok(pm2);
    assert.ok(codex);

    assert.equal(getManagedPackageInstallTarget(pm2), '7.0.1');
    assert.equal(getManagedPackageInstallTarget(codex), 'latest');
  });

  it('builds an SDK-compatible sync manifest from managed package definitions', () => {
    const definitions = managedNpmPackages.filter((item) => item.id === 'pm2' || item.id === 'codex');
    const manifest = buildDesktopNpmSyncManifest(definitions, 'https://registry.npmmirror.com/');

    assert.equal(manifest.syncMode, 'packages');
    assert.equal(manifest.registryMirror, 'https://registry.npmmirror.com/');
    assert.deepEqual(manifest.packages.pm2, { version: '7.0.1', target: '7.0.1' });
    assert.deepEqual(manifest.packages['@openai/codex'], { version: '*', target: 'latest' });
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
