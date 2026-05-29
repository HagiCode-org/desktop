import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildStartupFailurePayload } from '../startup-failure-payload.js';
import type { StartResult } from '../manifest-reader.js';
import {
  resolveCommandLaunch,
  resolveToolchainLaunchPlan,
  shouldUseShellForCommand,
} from '../toolchain-launch.js';
import { resolveBundledNodeRuntimePolicy } from '../bundled-node-runtime-policy.js';

const webServiceManagerPath = path.resolve(process.cwd(), 'src/main/web-service-manager.ts');
const hagiscriptRuntimeContextPath = path.resolve(process.cwd(), 'src/main/hagiscript-runtime-context.ts');
const hagiscriptServerManagerPath = path.resolve(process.cwd(), 'src/main/hagiscript-server-manager.ts');
const webServiceSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/webServiceSlice.ts');
const manifestReaderPath = path.resolve(process.cwd(), 'src/main/manifest-reader.ts');
const retiredCompatibilityPayloadField = 'startup' + 'Compatibility';

describe('web-service startup flow', () => {
  it('does not gate startup on a standalone preflight port-monitoring phase', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.equal(source.includes('StartupPhase.CheckingPort'), false);
    assert.equal(source.includes('Checking port availability...'), false);
    assert.equal(source.includes('evaluateFixedPortStartup'), false);
    assert.match(source, /emitPhase\(\s*StartupPhase\.Spawning/);
    assert.match(source, /waitForPortListening\(\)/);
    assert.match(source, /waitForHealthCheck\(\)/);
  });

  it('keeps transitional startup polling in starting state until startup truly fails or succeeds', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /private isStartupTransitionActive\(\): boolean/);
    assert.match(source, /const startupTransitionActive = this\.isStartupTransitionActive\(\);/);
    assert.match(source, /if \(startupTransitionActive && this\.currentPhase !== StartupPhase\.Error\) {\s*this\.status = 'starting';/);
    assert.match(source, /this\.currentPhase = StartupPhase\.HealthCheck;/);
  });

  it('resets stale restart counters for manual start and stop flows', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /A manual\s*\n\s*\/\/ Desktop start should always get a fresh attempt/);
    assert.match(source, /this\.restartCount = 0;\n\n    if \(this\.status === 'running'\)/);
    assert.match(source, /this\.lastResolvedServiceEnv = null;\n\s*this\.startTime = null;\n\s*this\.restartCount = 0;\n\s*this\.currentPhase = StartupPhase\.Idle;/);
    assert.match(source, /return await this\.runLifecycleTransition\('restart'\);/);
  });

  it('routes lifecycle through the hagiscript adapter and runtime context resolver', async () => {
    const webServiceSource = await fs.readFile(webServiceManagerPath, 'utf-8');
    const runtimeContextSource = await fs.readFile(hagiscriptRuntimeContextPath, 'utf-8');
    const serverManagerSource = await fs.readFile(hagiscriptServerManagerPath, 'utf-8');

    assert.match(webServiceSource, /setDependencyManagementService\(dependencyManagementService: DependencyManagementService \| null\)/);
    assert.match(webServiceSource, /resolveHagiscriptRuntimeContext\(/);
    assert.match(webServiceSource, /this\.hagiscriptServerManager\.start\(context\)/);
    assert.match(webServiceSource, /this\.hagiscriptServerManager\.restart\(context\)/);
    assert.match(webServiceSource, /this\.hagiscriptServerManager\.status\(context\)/);
    assert.match(webServiceSource, /this\.hagiscriptServerManager\.getRuntimeState\(context\)/);
    assert.match(webServiceSource, /hagiscript manifest override:/);
    assert.match(webServiceSource, /ASPNETCORE_URLS=/);
    assert.doesNotMatch(webServiceSource, /this\.pm2Manager\./);

    assert.match(runtimeContextSource, /getManagedCommandContext\('hagiscript'\)/);
    assert.match(runtimeContextSource, /buildDesktopHagiscriptRuntimeManifest\(/);
    assert.match(runtimeContextSource, /buildDesktopManagedServerVersionState\(/);
    assert.match(runtimeContextSource, /serverProgramRoot/);
    assert.match(runtimeContextSource, /serverDataRoot/);
    assert.match(runtimeContextSource, /npmPrefix: path\.resolve\(hagiscriptContext\.environment\.npmGlobalPrefix\)/);
    assert.match(runtimeContextSource, /servicePayloadPath,/);
    assert.match(runtimeContextSource, /serviceWorkingDirectory: aliasedServiceWorkingDirectory/);
    assert.match(runtimeContextSource, /DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE/);

    assert.match(serverManagerSource, /\['runtime', 'state', '--json'/);
    assert.match(serverManagerSource, /\['pm2', context\.serviceName, action, '--json'/);
    assert.match(serverManagerSource, /hagiscript PM2 command returned invalid JSON output/);
    assert.match(serverManagerSource, /parsePm2ProcessMetrics/);
  });

  it('injects desktop-managed code-server metadata into the backend child-process environment', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /const desktopManagedCodeServer = this\.configManager/);
    assert.match(source, /const config = this\.configManager\.getCodeServerConfig\(\)/);
    assert.match(source, /codeServer: desktopManagedCodeServer,/);
  });

  it('keeps Desktop-managed environment injection authoritative over legacy config env values', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /return \{\s*\.\.\.\(this\.config\.env \?\? \{\}\),\s*\.\.\.\(baseEnv \?\? \{\}\),/s);
    assert.doesNotMatch(source, /return \{\s*\.\.\.\(baseEnv \?\? \{\}\),\s*\.\.\.\(this\.config\.env \?\? \{\}\),/s);
  });

  it('accepts a resolved runtime descriptor instead of only reconstructing installed paths from version ids', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /setActiveRuntime\(runtime: ActiveRuntimeDescriptor \| null\)/);
    assert.match(source, /this\.activeRuntime = runtime/);
    assert.match(source, /this\.activeVersionPath = runtime\?\.rootPath \?\? null/);
    assert.match(source, /this\.setActiveRuntime\(\{/);
  });

  it('validates the active payload before hagiscript launch and keeps desktop compatibility gating', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /desktop-incompatible/);
    assert.match(source, /evaluateDesktopCompatibility\(manifest, desktopVersion\)/);
    assert.match(source, /validateFrameworkDependentPayload/);
    assert.match(source, /Required ASP\.NET Core runtime:/);
    assert.doesNotMatch(source, /validateBundledRuntimeForPlatform/);
    assert.doesNotMatch(source, /evaluateRuntimeCompatibility/);
    assert.equal(source.includes('Please ensure .NET Runtime 8.0 is installed and in PATH'), false);
  });

  it('keeps renderer startup phase definitions aligned with the shortened flow', async () => {
    const source = await fs.readFile(webServiceSlicePath, 'utf-8');

    assert.equal(source.includes("CheckingPort = 'checking_port'"), false);
    assert.match(source, /Spawning = 'spawning'/);
    assert.match(source, /WaitingListening = 'waiting_listening'/);
    assert.match(source, /HealthCheck = 'health_check'/);
  });

  it('caches managed launch context for status polling and only logs health-check transitions', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.equal(source.includes("private cachedManagedLaunchContext: { runtimeRoot: string; context: ManagedLaunchContext } | null = null;"), true);
    assert.match(source, /if \(this\.cachedManagedLaunchContext\?\.runtimeRoot === this\.activeVersionPath\) \{\s*return this\.cachedManagedLaunchContext\.context;\s*\}/s);
    assert.equal(source.includes("private lastHealthCheckLogState: 'healthy' | 'unhealthy' | null = null;"), true);
    assert.equal(source.includes("if (this.lastHealthCheckLogState !== 'healthy') {"), true);
    assert.equal(source.includes("this.lastHealthCheckLogState = 'healthy';"), true);
    assert.equal(source.includes("if (this.lastHealthCheckLogState !== 'unhealthy') {"), true);
    assert.equal(source.includes("this.lastHealthCheckLogState = 'unhealthy';"), true);
    assert.equal(source.includes('launchContext = await this.resolveManagedLaunchContextForLifecycleTransition();'), true);
    assert.equal(source.includes('logResolvedContext: true'), true);
  });

  it('keeps repeated manifest reads out of the default info log level', async () => {
    const source = await fs.readFile(manifestReaderPath, 'utf-8');

    assert.equal(source.includes("log.debug('[ManifestReader] Reading manifest:'"), true);
    assert.equal(source.includes("log.debug('[ManifestReader] Manifest loaded successfully:'"), true);
    assert.equal(source.includes("log.info('[ManifestReader] Reading manifest:'"), false);
    assert.equal(source.includes("log.info('[ManifestReader] Manifest loaded successfully:'"), false);
  });

  it('keeps startup failure diagnostics tied to the configured port context', () => {
    const result: StartResult = {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: 'listen EADDRINUSE: address already in use',
        duration: 0,
        timestamp: '2026-03-13T09:00:00.000Z',
        success: false,
      },
      parsedResult: {
        success: false,
        errorMessage: 'Service failed to start listening',
        rawOutput: 'listen EADDRINUSE: address already in use',
      },
    };

    const payload = buildStartupFailurePayload(result, 36556);

    assert.equal(payload.summary, 'Service failed to start listening');
    assert.equal(payload.log, 'listen EADDRINUSE: address already in use');
    assert.equal(payload.port, 36556);
    assert.equal(payload.timestamp, '2026-03-13T09:00:00.000Z');
    assert.equal(payload.truncated, false);
    assert.equal(retiredCompatibilityPayloadField in payload, false);
  });

  it('prefers bundled absolute toolchain executables and falls back to system PATH when missing', () => {
    const bundledNode = '/portable/toolchain/node/bin/node';
    const bundledNpm = '/portable/toolchain/node/bin/npm';
    const pathManager = {
      getPortableNodeExecutablePath: () => bundledNode,
      getPortableNpmExecutablePath: () => bundledNpm,
    };

    const nodePlan = resolveToolchainLaunchPlan({
      commandName: 'node',
      args: ['server.js', '--watch'],
      platform: 'linux',
      existsSync: target => target === bundledNode,
      pathManager,
    });
    const npmPlan = resolveToolchainLaunchPlan({
      commandName: 'npm',
      args: ['run', 'dev'],
      platform: 'linux',
      existsSync: () => false,
      pathManager,
    });

    assert.equal(nodePlan.command, bundledNode);
    assert.deepEqual(nodePlan.args, ['server.js', '--watch']);
    assert.equal(nodePlan.usedBundledToolchain, true);
    assert.equal(nodePlan.fellBackToSystemPath, false);
    assert.equal(nodePlan.shell, false);

    assert.equal(npmPlan.command, 'npm');
    assert.deepEqual(npmPlan.args, ['run', 'dev']);
    assert.equal(npmPlan.usedBundledToolchain, false);
    assert.equal(npmPlan.fellBackToSystemPath, true);
  });

  it('uses desktop default-enabled policy unless an explicit disable override is present', () => {
    const defaultPolicy = resolveBundledNodeRuntimePolicy({ defaultEnabledByConsumer: { desktop: true } });
    const disabledPolicy = resolveBundledNodeRuntimePolicy({
      defaultEnabledByConsumer: { desktop: true },
      explicitEnabled: false,
    });

    assert.equal(defaultPolicy.enabled, true);
    assert.equal(defaultPolicy.source, 'manifest-default');
    assert.equal(disabledPolicy.enabled, false);
    assert.equal(disabledPolicy.source, 'override');
  });

  it('does not resolve bundled node or npm when the effective desktop policy is disabled', () => {
    const bundledNode = '/portable/toolchain/node/bin/node';
    const policy = resolveBundledNodeRuntimePolicy({
      defaultEnabledByConsumer: { desktop: true },
      explicitEnabled: false,
    });
    const plan = resolveToolchainLaunchPlan({
      commandName: 'node',
      args: ['server.js'],
      platform: 'linux',
      existsSync: target => target === bundledNode,
      activationPolicy: policy,
      pathManager: {
        getPortableNodeExecutablePath: () => bundledNode,
        getPortableNpmExecutablePath: () => '/portable/toolchain/node/bin/npm',
      },
    });

    assert.equal(plan.command, 'node');
    assert.equal(plan.usedBundledToolchain, false);
    assert.equal(plan.resolutionSource, 'system');
    assert.equal(plan.activationPolicy?.source, 'override');
  });

  it('routes Windows command-wrapper executables through shell mode and keeps args unchanged', () => {
    const plan = resolveToolchainLaunchPlan({
      commandName: 'npm',
      args: ['install', '--global', '@openspec/cli'],
      platform: 'win32',
      existsSync: target => target.endsWith('npm.cmd'),
      pathManager: {
        getPortableNodeExecutablePath: () => 'C:\\portable\\toolchain\\node\\node.exe',
        getPortableNpmExecutablePath: () => 'C:\\portable\\toolchain\\node\\npm.cmd',
      },
    });

    assert.equal(plan.command, 'C:\\portable\\toolchain\\node\\npm.cmd');
    assert.deepEqual(plan.args, ['install', '--global', '@openspec/cli']);
    assert.equal(plan.shell, true);
    assert.equal(shouldUseShellForCommand('C:\\portable\\toolchain\\node\\node.exe', 'win32'), false);
    assert.equal(shouldUseShellForCommand('C:\\portable\\toolchain\\node\\npm.cmd', 'win32'), true);
  });

  it('quotes Windows absolute wrapper commands under Program Files roots before routing them through shell execution', () => {
    const npmLaunch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\npm.cmd',
      'win32',
    );
    const hagiscriptLaunch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\hagiscript.cmd',
      'win32',
    );
    const batchLaunch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\managed-tool.bat',
      'win32',
    );
    const nodeLaunch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\node.exe',
      'win32',
    );

    assert.equal(npmLaunch.command, '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\npm.cmd"');
    assert.equal(npmLaunch.shell, true);
    assert.equal(hagiscriptLaunch.command, '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\hagiscript.cmd"');
    assert.equal(hagiscriptLaunch.shell, true);
    assert.equal(batchLaunch.command, '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\managed-tool.bat"');
    assert.equal(batchLaunch.shell, true);
    assert.equal(nodeLaunch.command, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\node.exe');
    assert.equal(nodeLaunch.shell, false);
  });
});
