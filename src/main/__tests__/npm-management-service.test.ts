import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const servicePath = path.resolve(process.cwd(), 'src/main/npm-management-service.ts');
const catalogPath = path.resolve(process.cwd(), 'src/shared/npm-managed-packages.ts');

describe('npm management service contract', () => {
  it('uses activation policy to choose local or portable Node/npm for environment detection and operations', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /getDesktopActivationPolicy\(\)/);
    assert.match(source, /process\.env\.npm_node_execpath\?\.trim\(\) \|\| 'node'/);
    assert.match(source, /return 'npm'/);
    assert.match(source, /getPortableNodeExecutablePath\(\)/);
    assert.match(source, /getPortableNpmExecutablePath\(\)/);
    assert.match(source, /getPortableNodeRoot\(\)/);
    assert.match(source, /devStatus\?\.available && devStatus\.nodeExecutablePath/);
    assert.match(source, /path\.dirname\(path\.dirname\(devStatus\.nodeExecutablePath\)\)/);
    assert.match(source, /path\.join\(devStatus\.runtimeRoot, 'npm-cache'\)/);
    assert.match(source, /return this\.getNodeRuntimeRoot\(activationPolicy, devStatus\)/);
    assert.match(source, /getNpmGlobalBinRoot\(npmGlobalPrefix\)/);
    assert.match(source, /return this\.pathManager\.getPortableNodeRoot\(\)/);
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

  it('keeps hagiscript on embedded npm and routes other installs through hagiscript npm-sync manifests', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /definition\.installMode === 'hagiscript-sync'/);
    assert.match(source, /runHagiscriptSync\(\[definition\]\)/);
    assert.match(source, /buildHagiscriptSyncArgs/);
    assert.match(source, /buildHagiscriptSyncManifest/);
    assert.match(source, /writeHagiscriptSyncManifest/);
    assert.match(source, /'npm-sync'/);
    assert.match(source, /'--runtime'/);
    assert.match(source, /environment\.nodeRuntimeRoot/);
    assert.match(source, /'--manifest'/);
    assert.match(source, /'--registry-mirror'/);
  });

  it('gates non-hagiscript mutations and validates batch sync package ids before spawning', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /resolvePackageDefinitions\(request\.packageIds, 'sync'\)/);
    assert.match(source, /Unknown managed npm package/);
    assert.match(source, /validateHagiscriptDependency/);
    assert.match(source, /Install hagiscript before managing other npm packages/);
    assert.match(source, /hagiscript status is unknown/);
    assert.match(source, /hagiscript executable path is unavailable/);
    assert.match(source, /this\.runCommand\(\s*hagiscriptExecutablePath/);
  });

  it('persists npm mirror settings, derives locale-based defaults before manual changes, and includes them in snapshots', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /NPM_MIRROR_REGISTRY_URL = 'https:\/\/registry\.npmmirror\.com\/'/);
    assert.match(source, /DEFAULT_MIRROR_SETTINGS[\s\S]*enabled: false/);
    assert.match(source, /configManager\?: ConfigManager/);
    assert.match(source, /this\.configManager = options\.configManager \?\? new ConfigManager\(\)/);
    assert.match(source, /name: 'npm-management'/);
    assert.match(source, /if \(!this\.settingsStore\.has\('mirrorSettings'\)\)/);
    assert.match(source, /return this\.getDefaultMirrorSettings\(\)/);
    assert.match(source, /private getDefaultMirrorSettings\(\): NpmMirrorSettings/);
    assert.match(source, /const language = this\.configManager\.getAll\(\)\?\.settings\?\.language \?\? 'zh-CN'/);
    assert.match(source, /enabled: language === 'zh-CN'/);
    assert.match(source, /const mirrorSettings = this\.getMirrorSettings\(\)/);
    assert.match(source, /mirrorSettings,/);
    assert.match(source, /setMirrorSettings\(input: NpmMirrorSettingsInput\)/);
    assert.match(source, /this\.settingsStore\.set\('mirrorSettings'/);
  });

  it('adds registry args only to install operations when mirror acceleration is enabled', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /buildNpmOperationArgs/);
    assert.match(source, /operation === 'install'/);
    assert.match(source, /'--registry', registryUrl/);
    assert.match(source, /NPM_DEFAULT_REGISTRY_URL = 'https:\/\/registry\.npmjs\.org\/'/);
    assert.match(source, /shouldRetryWithoutMirror/);
    assert.match(source, /const installPrefix = this\.getManagedPackageInstallPrefix\(definition, environment\)/);
    assert.match(source, /return \['install', '-g', '--prefix', installPrefix, \.\.\.registryArgs, definition\.installSpec\]/);
    assert.match(source, /return \['uninstall', '-g', '--prefix', installPrefix, definition\.packageName\]/);
  });

  it('reports mirror usage when enabled without changing uninstall registry behavior', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /operation === 'install' && mirrorSettings\.enabled && mirrorSettings\.registryUrl/);
    assert.match(source, /using registry mirror \$\{mirrorSettings\.registryUrl\}/);
    assert.doesNotMatch(source, /uninstall[^\n]+--registry/);
  });

  it('defines the initial managed catalog for required tools', async () => {
    const source = await fs.readFile(catalogPath, 'utf8');

    assert.match(source, /id: 'hagiscript'/);
    assert.match(source, /id: 'openspec'/);
    assert.match(source, /id: 'skills'/);
    assert.match(source, /id: 'omniroute'/);
    assert.match(source, /id: 'claude-code'/);
    assert.match(source, /id: 'codex'/);
    assert.match(source, /id: 'github-copilot'/);
    assert.match(source, /id: 'codebuddy'/);
    assert.match(source, /id: 'opencode'/);
    assert.match(source, /id: 'qoder'/);
    assert.match(source, /id: 'gemini'/);
    assert.match(source, /category: 'bootstrap'/);
    assert.match(source, /category: 'agent-cli'/);
    assert.match(source, /installMode: 'embedded-npm'/);
    assert.match(source, /installMode: 'hagiscript-sync'/);
    assert.match(source, /packageName: '@hagicode\/hagiscript'/);
    assert.match(source, /installSpec: '@hagicode\/hagiscript'/);
    assert.match(source, /installSpec: '@fission-ai\/openspec@1\.3\.1'/);
    assert.match(source, /installSpec: 'skills@1\.5\.1'/);
    assert.match(source, /installSpec: 'omniroute@3\.6\.9'/);
    assert.match(source, /installSpec: '@anthropic-ai\/claude-code'/);
    assert.match(source, /installSpec: '@openai\/codex'/);
    assert.match(source, /installSpec: '@github\/copilot'/);
    assert.match(source, /installSpec: '@tencent-ai\/codebuddy-code'/);
    assert.match(source, /installSpec: 'opencode-ai'/);
    assert.match(source, /installSpec: '@qoder-ai\/qodercli'/);
    assert.match(source, /installSpec: '@google\/gemini-cli'/);
    assert.match(source, /required: true/);
  });

  it('prevents required managed npm packages from being removed', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /definition\?\.required/);
    assert.match(source, /is a required managed tool and cannot be removed/);
  });
});
