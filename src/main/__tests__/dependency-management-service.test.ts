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
    assert.match(source, /detectInstalledPackageFromInventory/);
    assert.match(source, /parseInstalledPackageInventoryEntry/);
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
    assert.match(source, /installMode: 'sdk-sync'/);
    assert.match(source, /runtimeManagedPackageManifestPackages/);
    assert.match(source, /applyRuntimeManagedPackageOverride/);
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
