import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const servicePath = path.resolve(process.cwd(), 'src/main/npm-management-service.ts');
const catalogPath = path.resolve(process.cwd(), 'src/shared/npm-managed-packages.ts');

describe('npm management service contract', () => {
  it('uses portable toolchain paths for environment detection and embedded npm operations', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /getPortableNodeExecutablePath\(\)/);
    assert.match(source, /getPortableNpmExecutablePath\(\)/);
    assert.match(source, /getPortableNpmGlobalBinRoot\(\)/);
    assert.match(source, /path\.join\(this\.pathManager\.getPortableToolchainRoot\(\), 'npm-global'\)/);
    assert.match(source, /npm_config_prefix: npmGlobalPrefix/);
    assert.match(source, /NPM_CONFIG_PREFIX: npmGlobalPrefix/);
    assert.match(source, /this\.spawnProcess\(command, args/);
  });

  it('models unavailable, error, installed, not-installed, unknown, and version states', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /status: 'unavailable'/);
    assert.match(source, /status: 'error'/);
    assert.match(source, /status: 'installed'/);
    assert.match(source, /status: 'not-installed'/);
    assert.match(source, /status: 'unknown'/);
    assert.match(source, /typeof packageJson\.version === 'string'/);
  });

  it('rejects invalid packages and locks conflicting npm operations', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /findManagedNpmPackage\(packageId\)/);
    assert.match(source, /Unknown managed npm package/);
    assert.match(source, /if \(this\.activeOperation\)/);
    assert.match(source, /Another npm operation is already active/);
  });

  it('normalizes npm process output into progress and operation result payloads', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /emitProgress\(definition\.id, operation, 'started'/);
    assert.match(source, /emitProgress\(definition\.id, operation, 'output'/);
    assert.match(source, /success \? 'completed' : 'failed'/);
    assert.match(source, /extractPercent\(message\)/);
    assert.match(source, /const snapshot = await this\.getSnapshot\(\)/);
    assert.match(source, /snapshot,/);
  });

  it('persists npm mirror settings with a disabled default and includes them in snapshots', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /NPM_MIRROR_REGISTRY_URL = 'https:\/\/registry\.npmmirror\.com\/'/);
    assert.match(source, /DEFAULT_MIRROR_SETTINGS[\s\S]*enabled: false/);
    assert.match(source, /name: 'npm-management'/);
    assert.match(source, /mirrorSettings: DEFAULT_MIRROR_SETTINGS/);
    assert.match(source, /const mirrorSettings = this\.getMirrorSettings\(\)/);
    assert.match(source, /mirrorSettings,/);
    assert.match(source, /setMirrorSettings\(input: NpmMirrorSettingsInput\)/);
    assert.match(source, /this\.settingsStore\.set\('mirrorSettings'/);
  });

  it('adds registry args only to install operations when mirror acceleration is enabled', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /buildNpmOperationArgs/);
    assert.match(source, /operation === 'install'/);
    assert.match(source, /'--registry', mirrorSettings\.registryUrl/);
    assert.match(source, /return \['install', '-g', '--prefix', environment\.npmGlobalPrefix, \.\.\.registryArgs, definition\.installSpec\]/);
    assert.match(source, /return \['uninstall', '-g', '--prefix', environment\.npmGlobalPrefix, definition\.packageName\]/);
  });

  it('reports mirror usage when enabled without changing uninstall registry behavior', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /operation === 'install' && mirrorSettings\.enabled && mirrorSettings\.registryUrl/);
    assert.match(source, /using registry mirror \$\{mirrorSettings\.registryUrl\}/);
    assert.doesNotMatch(source, /uninstall[^\n]+--registry/);
  });

  it('defines the initial managed catalog for required tools', async () => {
    const source = await fs.readFile(catalogPath, 'utf8');

    assert.match(source, /id: 'openspec'/);
    assert.match(source, /id: 'skills'/);
    assert.match(source, /id: 'omniroute'/);
    assert.match(source, /id: 'code-server'/);
    assert.match(source, /installSpec: 'openspec@latest'/);
    assert.match(source, /installSpec: 'skills@latest'/);
    assert.match(source, /installSpec: 'omniroute@latest'/);
    assert.match(source, /installSpec: 'code-server@latest'/);
    assert.match(source, /required: true/);
  });

  it('prevents required managed npm packages from being removed', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /definition\?\.required/);
    assert.match(source, /is a required managed tool and cannot be removed/);
  });
});
