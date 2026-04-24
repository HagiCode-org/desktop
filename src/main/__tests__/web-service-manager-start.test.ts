import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildStartupFailurePayload } from '../startup-failure-payload.js';
import type { StartResult } from '../manifest-reader.js';
import {
  resolveToolchainLaunchPlan,
  shouldUseShellForCommand,
} from '../toolchain-launch.js';
import { resolveBundledNodeRuntimePolicy } from '../bundled-node-runtime-policy.js';

const webServiceManagerPath = path.resolve(process.cwd(), 'src/main/web-service-manager.ts');
const webServiceSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/webServiceSlice.ts');

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

  it('spawns the managed DLL with the pinned dotnet runtime and runtime isolation env', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /resolveManagedLaunchContext/);
    assert.match(source, /validateBundledRuntimeForPlatform/);
    assert.match(source, /Starting service with bundled dotnet runtime/);
    assert.match(source, /resolveDesktopBundledNodeRuntimePolicyFromEnv/);
    assert.match(source, /injectPortableToolchainEnv\(runtimeEnv, this\.pathManager, \{ activationPolicy \}\)/);
    assert.match(source, /resolveToolchainLaunchPlan\(\{/);
    assert.match(source, /spawn\(launchContext\.dotnetPath, spawnArgs/);
    assert.match(source, /const spawnArgs = \[launchContext\.serviceDllPath, \.\.\.\(this\.config\.args \|\| \[\]\)\]/);
    assert.match(source, /serviceWorkingDirectory: path\.dirname\(payloadValidation\.payloadPaths\.serviceDllPath\)/);
    assert.match(source, /cwd: launchContext\.serviceWorkingDirectory/);
    assert.match(source, /DOTNET_ROOT: runtimeRoot/);
    assert.match(source, /DOTNET_MULTILEVEL_LOOKUP: '0'/);
    assert.match(source, /includes pinned runtime root/);
    assert.match(source, /prepends bundled toolchain paths/);
    assert.match(source, /disabled or unavailable, fallback to inherited system PATH/);
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

  it('does not resolve bundled node or npm when the effective desktop policy is disabled', () => {
    const bundledNode = '/portable/toolchain/node/bin/node';
    const policy = resolveBundledNodeRuntimePolicy({ defaultEnabledByConsumer: { desktop: false } });
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
    assert.equal(plan.activationPolicy?.source, 'manifest-default');
  });

  it('uses shell mode only for Windows command-wrapper executables and keeps args unchanged', () => {
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
});
