import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildHagiscriptSyncArgs,
  buildHagiscriptSyncManifest,
} from '../hagiscript-sync.js';
import { managedNpmPackages } from '../../shared/npm-managed-packages.js';
import { resolveCommandLaunch } from '../toolchain-launch.js';

const servicePath = path.resolve(process.cwd(), 'src/main/dependency-management-service.ts');
const hagiscriptSyncPath = path.resolve(process.cwd(), 'src/main/hagiscript-sync.ts');
const catalogPath = path.resolve(process.cwd(), 'src/shared/npm-managed-packages.ts');

describe('dependency management service contract', () => {
  it('uses activation policy to choose local or portable Node/npm for environment detection and operations', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /getDesktopActivationPolicy\(\)/);
    assert.match(source, /injectPortableToolchainEnv\(process\.env, this\.pathManager, \{/);
    assert.match(source, /activationPolicy,/);
    assert.match(source, /process\.env\.npm_node_execpath\?\.trim\(\) \|\| 'node'/);
    assert.match(source, /return 'npm'/);
    assert.match(source, /getPortableNodeExecutablePath\(\)/);
    assert.match(source, /getPortableNodeRoot\(\)/);
    assert.doesNotMatch(source, /DevNodeRuntimeManager/);
    assert.doesNotMatch(source, /devStatus/);
    assert.match(source, /this\.pathManager\.getNodeMajorNpmGlobalPaths\(\{/);
    assert.match(source, /nodeVersion: nodeVersion \?\? process\.versions\.node/);
    assert.match(source, /npmGlobalPaths,/);
    assert.match(source, /env\.npm_execpath = this\.getBundledNpmCliPath\(nodeRuntimeRoot\);/);
    assert.match(source, /private buildNpmExecution\(/);
    assert.match(source, /private async detectNpmVersion\(/);
    assert.match(source, /private runNpmCommand\(/);
    assert.match(source, /return this\.pathManager\.getPortableNodeRoot\(\)/);
    assert.match(source, /delete env\.npm_config_prefix/);
    assert.match(source, /delete env\.NPM_CONFIG_PREFIX/);
    assert.match(source, /HAGICODE_PORTABLE_TOOLCHAIN_ROOT/);
    assert.match(source, /HAGICODE_DESKTOP_WINDOWS_STORE/);
    assert.match(source, /process\.windowsStore/);
    assert.match(source, /const launch = resolveCommandLaunch\(command, this\.platform\);/);
    assert.match(source, /return executeCliStreaming\(\{/);
    assert.match(source, /command: launch\.command,/);
    assert.match(source, /shell: launch\.shell,/);
    assert.match(source, /onOutput: \(_type, chunk\) => \{/);
  });

  it('treats bundled Node as the readiness gate and keeps npm failures attached to operation-time diagnostics', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /const available = node\.status === 'available';/);
    assert.match(source, /error: available \? undefined : node\.message \?\? 'Embedded Node environment is unavailable'/);
    assert.doesNotMatch(source, /const available = node\.status === 'available' && npm\.status === 'available';/);
  });

  it('models unavailable, error, installed, not-installed, unknown, and version states', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /status: 'unavailable'/);
    assert.match(source, /status: 'error'/);
    assert.match(source, /status: 'installed'/);
    assert.match(source, /status: 'not-installed'/);
    assert.match(source, /status: 'unknown'/);
    assert.match(source, /typeof packageJson\.version === 'string'/);
    assert.match(source, /Installed package executable is missing at/);
  });

  it('rejects invalid packages and locks conflicting npm operations', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /findManagedNpmPackage\(packageId\)/);
    assert.match(source, /Unknown managed npm package/);
    assert.match(source, /isVendoredRuntimeMutationId\(packageId\)/);
    assert.match(source, /Desktop-managed vendored runtime and cannot be mutated through npm package operations/);
    assert.match(source, /if \(this\.activeOperation\)/);
    assert.match(source, /Another npm operation is already active/);
  });

  it('accepts hagiscript install requests with selector overrides and persists them after successful installs', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /async install\(request: string \| DependencyManagementInstallRequest\)/);
    assert.match(source, /private normalizeInstallRequest\(request: string \| DependencyManagementInstallRequest\)/);
    assert.match(source, /private resolveInstallRequest\(/);
    assert.match(source, /latest, or dev/);
    assert.match(source, /definition\.id !== 'hagiscript'/);
    assert.match(source, /does not support install selectors/);
    assert.match(source, /private getConfiguredHagiscriptSelector\(\)/);
    assert.match(source, /private setConfiguredHagiscriptSelector\(selector: string \| null\)/);
    assert.match(source, /installSpec: `\$\{definition\.packageName\}@\$\{selector\}`/);
    assert.match(source, /const previousHagiscriptSelector = definition\.id === 'hagiscript'/);
    assert.match(source, /if \(success && definition\.id === 'hagiscript' && hagiscriptSelectorToPersist\)/);
    assert.match(source, /this\.setConfiguredHagiscriptSelector\(hagiscriptSelectorToPersist\)/);
    assert.match(source, /if \(definition\.id === 'hagiscript' && hagiscriptSelectorToPersist\) \{\s*this\.setConfiguredHagiscriptSelector\(previousHagiscriptSelector\);/);
  });

  it('normalizes npm process output into progress and operation result payloads', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /emitProgress\(definition\.id, operation, 'started'/);
    assert.match(source, /emitProgress\(definition\.id, operation, 'output'/);
    assert.match(source, /success \? 'completed' : 'failed'/);
    assert.match(source, /extractPercent\(message\)/);
    assert.match(source, /const snapshot = await this\.getSnapshot\(\)/);
    assert.match(source, /const finalizedSnapshot = this\.finalizeOperationSnapshot\(snapshot\);/);
    assert.match(source, /snapshot: finalizedSnapshot,/);
    assert.match(source, /const verificationError = success\s*\?\s*this\.validatePackageOperationOutcome\(definition, operation, status\)/);
  });

  it('returns post-operation snapshots for successful verification, verification failure, and npm failure paths', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /const snapshot = await this\.getSnapshot\(\);\s*const status = snapshot\.packages\.find\(\(item\) => item\.id === definition\.id\);/);
    assert.match(source, /const verificationError = success\s*\?\s*this\.validatePackageOperationOutcome\(definition, operation, status\)\s*:\s*null;/);
    assert.match(source, /if \(verificationError\) \{\s*success = false;\s*errorMessage = verificationError;\s*\}/);
    assert.match(source, /if \(!success\) \{\s*errorMessage = firstMeaningfulLine\(result\.stderr \|\| result\.stdout\) \?\? `npm exited with code \$\{result\.exitCode\}`;\s*\}/);
    assert.match(source, /const finalizedStatus = finalizedSnapshot\.packages\.find\(\(item\) => item\.id === definition\.id\);/);
    assert.match(source, /return \{\s*success,\s*packageId: definition\.id,\s*operation,\s*status: finalizedStatus,\s*error: errorMessage,\s*snapshot: finalizedSnapshot,/);
  });

  it('keeps hagiscript on embedded npm and routes other installs through hagiscript npm-sync manifests', async () => {
    const source = `${await fs.readFile(servicePath, 'utf8')}\n${await fs.readFile(hagiscriptSyncPath, 'utf8')}`;

    assert.match(source, /definition\.installMode === 'hagiscript-sync'/);
    assert.match(source, /runHagiscriptSync\(\[definition\]\)/);
    assert.match(source, /buildHagiscriptSyncArgs/);
    assert.match(source, /buildHagiscriptSyncManifest/);
    assert.match(source, /writeHagiscriptSyncManifest/);
    assert.match(source, /'npm-sync'/);
    assert.match(source, /'--runtime'/);
    assert.match(source, /environment\.nodeRuntimeRoot/);
    assert.match(source, /'--prefix'/);
    assert.match(source, /environment\.npmGlobalPrefix/);
    assert.match(source, /'--manifest'/);
    assert.match(source, /'--registry-mirror'/);
    assert.match(source, /private buildHagiscriptCommandEnv\(/);
    assert.match(source, /env\.npm_config_prefix = environment\.npmGlobalPrefix;/);
    assert.match(source, /env\.NPM_CONFIG_PREFIX = environment\.npmGlobalPrefix;/);
    assert.match(source, /env\.npm_config_global_prefix = environment\.npmGlobalPrefix;/);
    assert.match(source, /env\.NPM_CONFIG_GLOBAL_PREFIX = environment\.npmGlobalPrefix;/);
  });


  it('injects pm2 into CLI sync and verification while preserving the requested package ids', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /const requestedPackageIds = validation\.definitions/);
    assert.match(source, /const syncPackageIds = this\.resolveCliSyncPackageIds\(requestedPackageIds\);/);
    assert.match(source, /private resolveCliSyncPackageIds\(requestedPackageIds: readonly ManagedNpmPackageId\[\]\): ManagedNpmPackageId\[\] \{/);
    assert.match(source, /addPackageId\('pm2'\);/);
    assert.match(source, /for \(const packageId of requestedPackageIds\) \{\s*addPackageId\(packageId\);/);
    assert.match(source, /const installResult = await this\.syncPackages\(\{ packageIds: syncPackageIds \}\);/);
    assert.match(source, /const verificationPackageIds: ManagedNpmPackageId\[\] = \['hagiscript', \.\.\.syncPackageIds\];/);
    assert.match(source, /requestedPackageIds,/);
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
    assert.match(source, /const statuses = snapshot\.packages\.filter\(\(item\) => packageIds\.includes\(item\.id\)\)/);
    assert.match(source, /this\.validatePackageOperationOutcome\(\s*definition,\s*'sync'/);
  });

  it('validates hagiscript sync success against refreshed package statuses before emitting completion', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /const snapshot = await this\.getSnapshot\(\);\s*const statuses = snapshot\.packages\.filter\(\(item\) => packageIds\.includes\(item\.id\)\);/);
    assert.match(source, /if \(success\) \{\s*const verificationError = definitions\s*\.map\(\(definition\) => this\.validatePackageOperationOutcome\(/);
    assert.match(source, /if \(verificationError\) \{\s*success = false;\s*errorMessage = verificationError;\s*\}/);
    assert.match(source, /success \? 'completed' : 'failed'/);
    assert.match(source, /const finalizedSnapshot = this\.finalizeOperationSnapshot\(snapshot\);/);
    assert.match(source, /const finalizedStatuses = finalizedSnapshot\.packages\.filter\(\(item\) => packageIds\.includes\(item\.id\)\);/);
    assert.match(source, /return \{\s*success,\s*packageIds,\s*operation: 'sync',\s*statuses: finalizedStatuses,\s*error: errorMessage,\s*snapshot: finalizedSnapshot,/);
  });

  it('clears activeOperation from returned terminal snapshots without forcing callers to trigger an extra refresh', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /private finalizeOperationSnapshot\(snapshot: DependencyManagementSnapshot\): DependencyManagementSnapshot \{/);
    assert.match(source, /activeOperation: this\.activeOperation,/);
    assert.match(source, /generatedAt: new Date\(\)\.toISOString\(\),/);
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
    assert.match(source, /const prefixArgs = \['--prefix', environment\.npmGlobalPrefix\];/);
    assert.match(source, /'--registry', registryUrl/);
    assert.match(source, /NPM_DEFAULT_REGISTRY_URL = 'https:\/\/registry\.npmjs\.org\/'/);
    assert.match(source, /shouldRetryWithoutMirror/);
    assert.match(source, /const installPrefix = this\.getManagedPackageInstallPrefix\(definition, environment\)/);
    assert.match(source, /return \['install', '-g', \.\.\.prefixArgs, \.\.\.registryArgs, definition\.installSpec\]/);
    assert.match(source, /return \['uninstall', '-g', \.\.\.prefixArgs, definition\.packageName\]/);
  });

  it('cleans all Windows wrapper artifacts and rejects exit-code-only false positives after install or uninstall', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /private getManagedPackageCommandArtifacts\(/);
    assert.match(source, /buildNpmGlobalCommandArtifactPaths\(/);
    assert.match(source, /await Promise\.all\(paths\.commandArtifacts\.map\(\(artifactPath\) => fs\.rm\(artifactPath, \{ force: true \}\)\)\);/);
    assert.match(source, /private validatePackageOperationOutcome\(/);
    assert.match(source, /Desktop could not detect the package in/);
    assert.match(source, /Desktop still detected the package in/);
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
    assert.match(source, /id: 'pm2'/);
    assert.match(source, /id: 'claude-code'/);
    assert.match(source, /id: 'codex'/);
    assert.match(source, /id: 'github-copilot'/);
    assert.match(source, /id: 'codebuddy'/);
    assert.match(source, /id: 'opencode'/);
    assert.match(source, /id: 'qoder'/);
    assert.match(source, /id: 'gemini'/);
    assert.match(source, /id: 'impeccable'/);
    assert.match(source, /category: 'bootstrap'/);
    assert.match(source, /category: 'agent-cli'/);
    assert.match(source, /category: 'developer-tool'/);
    assert.match(source, /installMode: 'embedded-npm'/);
    assert.match(source, /installMode: 'hagiscript-sync'/);
    assert.match(source, /packageName: '@hagicode\/hagiscript'/);
    assert.match(source, /installSpec: '@hagicode\/hagiscript@0\.2\.9'/);
    assert.match(source, /installSpec: '@fission-ai\/openspec@1\.3\.1'/);
    assert.match(source, /installSpec: 'skills@1\.5\.1'/);
    assert.match(source, /packageName: 'pm2'/);
    assert.match(source, /binName: 'pm2'/);
    assert.match(source, /installSpec: 'pm2@7\.0\.1'/);
    assert.match(source, /installSpec: '@anthropic-ai\/claude-code'/);
    assert.match(source, /installSpec: '@openai\/codex'/);
    assert.match(source, /installSpec: '@github\/copilot'/);
    assert.match(source, /installSpec: '@tencent-ai\/codebuddy-code'/);
    assert.match(source, /installSpec: 'opencode-ai'/);
    assert.match(source, /installSpec: '@qoder-ai\/qodercli'/);
    assert.match(source, /installSpec: '@google\/gemini-cli'/);
    assert.match(source, /installSpec: 'impeccable@2\.1\.9'/);
    assert.match(source, /required: true/);
  });

  it('uses effective snapshot definitions when computing readiness summaries', async () => {
    const source = await fs.readFile(catalogPath, 'utf8');

    assert.match(source, /const effectiveDefinition = statusSnapshot\?\.definition \?\? definition;/);
    assert.match(source, /getManagedPackageRequiredVersionRange\(effectiveDefinition\)/);
    assert.match(source, /isManagedPackageVersionSatisfied\(effectiveDefinition, installedVersion\)/);
    assert.match(source, /definition: effectiveDefinition,/);
    assert.match(source, /installSpec: effectiveDefinition\.installSpec,/);
  });

  it('exposes vendored runtime activation progress listeners and snapshot state', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /getActiveVendoredRuntimeActivation\(\)/);
    assert.match(source, /onVendoredRuntimeActivationProgress\(/);
    assert.match(source, /return onVendoredRuntimeActivationProgress\(listener\);/);
    assert.match(source, /activeRuntimeActivation: getActiveVendoredRuntimeActivation\(\),/);
  });

  it('degrades vendored runtime inspection failures into snapshots instead of failing refresh', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /private async getVendoredRuntimeSnapshots\(\): Promise<VendoredRuntimeStatusSnapshot\[\]>/);
    assert.match(source, /this\.inspectVendoredRuntimeSafely\('code-server'/);
    assert.match(source, /installStatus: 'failed'/);
    assert.match(source, /status: 'damaged'/);
    assert.match(source, /Vendored runtime inspection failed/);
  });

  it('prevents required managed npm packages from being removed', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /definition\?\.required/);
    assert.match(source, /is a required managed tool and cannot be removed/);
  });

  it('exposes managed command context for PM2 lifecycle integrations', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /export interface ManagedNpmCommandContext/);
    assert.match(source, /getManagedCommandContext\(packageId: ManagedNpmPackageId\)/);
    assert.match(source, /detectPackageStatus\(definition, environment\)/);
    assert.match(source, /executablePath: packageStatus\.executablePath/);
  });

  it('keeps npm detection and bootstrap installs on the same direct node+npm-cli launch contract for Steam-style Program Files roots', async () => {
    const source = await fs.readFile(servicePath, 'utf8');
    const launch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\node.exe',
      'win32',
    );

    assert.equal(launch.command, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\node.exe');
    assert.equal(launch.shell, false);
    assert.match(source, /const node = await this\.detectExecutableVersion\('node', this\.getNodeExecutablePath\(effectivePolicy\), \['--version'\], initialCommandEnv\);/);
    assert.match(source, /const npm = await this\.detectNpmVersion\(effectivePolicy, commandEnv\);/);
    assert.match(source, /command: this\.getNodeExecutablePath\(activationPolicy\),/);
    assert.match(source, /args: \[executablePath, \.\.\.args\],/);
    assert.match(source, /const result = await this\.runCommand\(executablePath, args, undefined, env\);/);
    assert.match(source, /let result = await this\.runNpmCommand\(activationPolicy, args,/);
    assert.match(source, /shell: launch\.shell,/);
  });

  it('routes hagiscript npm-sync wrappers and manifest arguments through the Windows shell-aware managed command launch path', async () => {
    const source = await fs.readFile(servicePath, 'utf8');
    const launch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\hagiscript.cmd',
      'win32',
    );
    const runtimeRoot = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node';
    const manifestPath = 'C:\\Users\\Test User\\AppData\\Local\\Temp\\hagicode npm sync\\manifest.json';
    const args = buildHagiscriptSyncArgs({
      available: true,
      node: { status: 'available', version: '24.12.0', executablePath: path.join(runtimeRoot, 'node.exe') },
      npm: { status: 'available', version: '10.9.2', executablePath: path.join(runtimeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js') },
      toolchainRoot: path.dirname(runtimeRoot),
      nodeRuntimeRoot: runtimeRoot,
      nodeVersion: '24.12.0',
      nodeMajorVersion: '24',
      npmGlobalPrefix: path.join(runtimeRoot, 'global'),
      npmGlobalBinRoot: path.join(runtimeRoot, 'global'),
      npmGlobalModulesRoot: path.join(runtimeRoot, 'global', 'node_modules'),
      npmCacheRoot: path.join(runtimeRoot, 'npmCache'),
    }, manifestPath, 'https://registry.npmmirror.com/');

    assert.equal(launch.command, '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\hagiscript.cmd"');
    assert.equal(launch.shell, true);
    assert.deepEqual(args, [
      'npm-sync',
      '--runtime',
      runtimeRoot,
      '--prefix',
      path.join(runtimeRoot, 'global'),
      '--manifest',
      manifestPath,
      '--registry-mirror',
      'https://registry.npmmirror.com/',
    ]);
    assert.match(source, /const manifest = await this\.writeHagiscriptSyncManifest\(definitions\);/);
    assert.match(source, /this\.buildHagiscriptSyncArgs\(environment, manifest\.manifestPath, mirrorSettings\.registryUrl\)/);
    assert.match(source, /const commandEnv = this\.buildHagiscriptCommandEnv\(activationPolicy, environment\);/);
    assert.match(source, /const result = await this\.runCommand\(\s*hagiscriptExecutablePath,\s*this\.buildHagiscriptSyncArgs\(environment, manifest\.manifestPath, mirrorSettings\.registryUrl\),/);
  });

  it('marks hagiscript child processes when Desktop runs from Windows Store/MSIX', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /if \(this\.platform === 'win32' && process\.windowsStore\) \{/);
    assert.match(source, /env\.HAGICODE_DESKTOP_WINDOWS_STORE = '1';/);
    assert.match(source, /delete env\.HAGICODE_DESKTOP_WINDOWS_STORE;/);
  });

  it('keeps batch sync package selectors in the manifest instead of npm-sync positional arguments', () => {
    const selectedDefinitions = managedNpmPackages.filter((definition) => (
      definition.id === 'skills' ||
      definition.id === 'openspec' ||
      definition.id === 'pm2' ||
      definition.id === 'claude-code'
    ));
    const manifest = buildHagiscriptSyncManifest(selectedDefinitions);
    const args = buildHagiscriptSyncArgs({
      available: true,
      node: { status: 'available', version: '24.12.0', executablePath: 'C:\\Program Files\\HagiCode\\node.exe' },
      npm: { status: 'available', version: '10.9.2', executablePath: 'C:\\Program Files\\HagiCode\\npm-cli.js' },
      toolchainRoot: 'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain',
      nodeRuntimeRoot: 'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain\\node',
      nodeVersion: '24.12.0',
      nodeMajorVersion: '24',
      npmGlobalPrefix: 'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain\\node\\global',
      npmGlobalBinRoot: 'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain\\node\\global',
      npmGlobalModulesRoot: 'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain\\node\\global\\node_modules',
      npmCacheRoot: 'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain\\node\\npmCache',
    }, 'C:\\Users\\Test User\\AppData\\Local\\Temp\\hagicode npm sync\\manifest.json');

    assert.deepEqual(manifest.packages.skills, { version: '1.5.1', target: '1.5.1' });
    assert.deepEqual(manifest.packages['@fission-ai/openspec'], { version: '1.3.1', target: '1.3.1' });
    assert.deepEqual(manifest.packages.pm2, { version: '7.0.1', target: '7.0.1' });
    assert.deepEqual(manifest.packages['@anthropic-ai/claude-code'], { version: '*', target: 'latest' });
    assert.equal(Object.keys(manifest.packages).length, 4);
    assert.deepEqual(args.slice(0, 7), [
      'npm-sync',
      '--runtime',
      'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain\\node',
      '--prefix',
      'C:\\Program Files\\HagiCode\\resources\\extra\\toolchain\\node\\global',
      '--manifest',
      'C:\\Users\\Test User\\AppData\\Local\\Temp\\hagicode npm sync\\manifest.json',
    ]);
    assert.equal(args.includes('skills@1.5.1'), false);
    assert.equal(args.includes('@fission-ai/openspec@1.3.1'), false);
    assert.equal(args.includes('pm2'), false);
    assert.equal(args.includes('@anthropic-ai/claude-code'), false);
  });
});
