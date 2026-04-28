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
const webServiceSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/webServiceSlice.ts');
const retiredCompatibilityPayloadField = 'startup' + 'Compatibility';

describe('web-service startup flow', () => {
  it('does not gate startup on a standalone preflight port-monitoring phase', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.equal(source.includes('StartupPhase.CheckingPort'), false);
    assert.equal(source.includes('Checking port availability...'), false);
    assert.equal(source.includes('evaluateFixedPortStartup'), false);
    assert.match(source, /emitPhase\(StartupPhase\.Spawning/);
    assert.match(source, /waitForPortListening\(\)/);
    assert.match(source, /waitForHealthCheck\(\)/);
  });

  it('resets stale restart counters for manual start and stop flows', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /A manual\s*\n\s*\/\/ Desktop start should always get a fresh attempt/);
    assert.match(source, /this\.restartCount = 0;\n\n    if \(this\.status === 'running'\)/);
    assert.match(source, /this\.lastPm2Env = null;\n\s*this\.startTime = null;\n\s*this\.restartCount = 0;\n\s*this\.currentPhase = StartupPhase\.Idle;/);
    assert.match(source, /this\.status = 'stopped';\n\s*this\.restartCount = 0;\n\s*this\.currentPhase = StartupPhase\.Idle;\n\s*return await this\.start\(\);/);
  });

  it('starts the managed DLL through PM2 with the pinned dotnet runtime and runtime isolation env', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /resolveManagedLaunchContext/);
    assert.match(source, /validateBundledRuntimeForPlatform/);
    assert.match(source, /Starting service with bundled dotnet runtime/);
    assert.match(source, /getDesktopActivationPolicy\(\)/);
    assert.match(source, /injectPortableToolchainEnv\(runtimeEnv, this\.pathManager, \{ activationPolicy \}\)/);
    assert.doesNotMatch(source, /DevNodeRuntimeManager/);
    assert.doesNotMatch(source, /HAGICODE_DEV_NODE_RUNTIME_ROOT/);
    assert.doesNotMatch(source, /prepends development Node runtime paths/);
    assert.match(source, /toolchainEnv\.usedBundledToolchain\s*\?\s*this\.pathManager\.getPortableNodeRoot\(\)/);
    assert.match(source, /this\.applySelectedNodeNpmEnvironment\(toolchainEnv\.env, selectedNodeRuntimeRoot\)/);
    assert.match(source, /const spawnArgs = \[launchContext\.serviceDllPath, \.\.\.\(this\.config\.args \|\| \[\]\)\]/);
    assert.match(source, /serviceWorkingDirectory: path\.dirname\(payloadValidation\.payloadPaths\.serviceDllPath\)/);
    assert.match(source, /this\.pm2Manager\.startFresh\(\{/);
    assert.match(source, /isManagedServiceReachable\(this\.config\.port\)/);
    assert.doesNotMatch(source, /terminateLingeringServiceByPort/);
    assert.match(source, /PM2 start may fail if this is a non-PM2 port conflict/);
    assert.match(source, /dotnetPath: launchContext\.dotnetPath/);
    assert.match(source, /serviceDllPath: launchContext\.serviceDllPath/);
    assert.match(source, /serviceWorkingDirectory: launchContext\.serviceWorkingDirectory/);
    assert.match(source, /DOTNET_ROOT: runtimeRoot/);
    assert.match(source, /DOTNET_MULTILEVEL_LOOKUP: '0'/);
    assert.match(source, /includes pinned runtime root/);
    assert.match(source, /Bundled portable toolchain activated for desktop-managed startup/);
    assert.match(source, /prepends bundled toolchain paths/);
    assert.match(source, /explicitly disabled for desktop startup; keeping inherited system PATH/);
    assert.match(source, /unavailable for desktop startup; keeping inherited system PATH/);
    assert.match(source, /Missing bundled PATH entries:/);
  });

  it('accepts a resolved runtime descriptor instead of only reconstructing installed paths from version ids', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /setActiveRuntime\(runtime: ActiveRuntimeDescriptor \| null\)/);
    assert.match(source, /this\.activeRuntime = runtime/);
    assert.match(source, /this\.activeVersionPath = runtime\?\.rootPath \?\? null/);
    assert.match(source, /this\.setActiveRuntime\(\{/);
  });

  it('fails fast when the pinned runtime is missing, unofficial, or incompatible and does not fall back to machine dotnet', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /Managed runtime validation failed:/);
    assert.match(source, /desktop-incompatible/);
    assert.match(source, /evaluateDesktopCompatibility\(manifest, app\.getVersion\(\)\)/);
    assert.match(source, /Pinned runtime root:/);
    assert.match(source, /Required ASP\.NET Core runtime:/);
    assert.match(source, /Packaged Desktop does not fall back to a machine-wide dotnet installation/);
    assert.equal(source.includes('Please ensure .NET Runtime 8.0 is installed and in PATH'), false);
  });

  it('keeps renderer startup phase definitions aligned with the shortened flow', async () => {
    const source = await fs.readFile(webServiceSlicePath, 'utf-8');

    assert.equal(source.includes("CheckingPort = 'checking_port'"), false);
    assert.match(source, /Spawning = 'spawning'/);
    assert.match(source, /WaitingListening = 'waiting_listening'/);
    assert.match(source, /HealthCheck = 'health_check'/);
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

  it('keeps Windows command-wrapper executables off shell mode and keeps args unchanged', () => {
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
    assert.equal(plan.shell, false);
    assert.equal(shouldUseShellForCommand('C:\\portable\\toolchain\\node\\node.exe', 'win32'), false);
    assert.equal(shouldUseShellForCommand('C:\\portable\\toolchain\\node\\npm.cmd', 'win32'), false);
  });

  it('keeps Windows absolute wrapper commands under Program Files roots unquoted and off shell execution', () => {
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

    assert.equal(npmLaunch.command, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\npm.cmd');
    assert.equal(npmLaunch.shell, false);
    assert.equal(hagiscriptLaunch.command, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\hagiscript.cmd');
    assert.equal(hagiscriptLaunch.shell, false);
    assert.equal(batchLaunch.command, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\managed-tool.bat');
    assert.equal(batchLaunch.shell, false);
    assert.equal(nodeLaunch.command, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\node.exe');
    assert.equal(nodeLaunch.shell, false);
  });
});
