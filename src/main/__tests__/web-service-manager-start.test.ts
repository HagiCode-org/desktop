import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildStartupFailurePayload } from '../startup-failure-payload.js';
import type { StartResult } from '../manifest-reader.js';
import {
  resolveCommandLaunch,
  shouldUseShellForCommand,
} from '../toolchain-launch.js';

const webServiceManagerPath = path.resolve(process.cwd(), 'src/main/web-service-manager.ts');
const backendProcessOwnerPath = path.resolve(process.cwd(), 'src/main/backend-process-owner.ts');
const webServiceSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/webServiceSlice.ts');
const manifestReaderPath = path.resolve(process.cwd(), 'src/main/manifest-reader.ts');
const retiredCompatibilityPayloadField = 'startup' + 'Compatibility';

describe('web-service startup flow', () => {
  it('uses a direct owned child, rejects unowned listeners, and gates readiness on HTTP health', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');
    const ownerSource = await fs.readFile(backendProcessOwnerPath, 'utf-8');

    assert.equal(source.includes('StartupPhase.CheckingPort'), false);
    assert.equal(source.includes('Checking port availability...'), false);
    assert.equal(source.includes('evaluateFixedPortStartup'), false);
    assert.match(source, /backendProcessOwner\.start\(launch\)/);
    assert.match(source, /checkPortAvailable\(this\.config\.port\)/);
    assert.match(source, /Desktop will not adopt a port-only listener/);
    assert.match(source, /emitPhase\(\s*StartupPhase\.Spawning/);
    assert.match(source, /waitForPortListening\(this\.startTimeout\)/);
    assert.match(source, /waitForHealthCheck\(\)/);
    assert.match(ownerSource, /shell:\s*false/);
  });

  it('keeps transitional startup polling in starting state until startup truly fails or succeeds', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /private isStartupTransitionActive\(\): boolean/);
    assert.match(source, /this\.currentPhase === StartupPhase\.CheckingVersion/);
    assert.match(source, /this\.currentPhase === StartupPhase\.CheckingDependencies/);
    assert.match(source, /const startupTransitionActive = this\.isStartupTransitionActive\(\);/);
    assert.match(source, /if \(startupTransitionActive && this\.currentPhase !== StartupPhase\.Error\) {\s*this\.status = 'starting';/);
    assert.match(source, /this\.currentPhase = StartupPhase\.HealthCheck;/);
  });

  it('accepts externally emitted prelaunch phases as part of the startup transition', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /syncExternalStartupPhase\(phase: StartupPhase, message\?: string\): void/);
    assert.match(source, /case StartupPhase\.CheckingVersion:/);
    assert.match(source, /case StartupPhase\.CheckingDependencies:/);
    assert.match(source, /this\.status = 'starting';/);
    assert.match(source, /this\.emitPhase\(phase, message\);/);
  });

  it('resets stale restart counters for manual start and stop flows', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /A manual Desktop start gets a fresh automatic-restart budget/);
    assert.match(source, /this\.restartCount = 0;\s*this\.lastBackendWasRunning = false;/);
    assert.match(source, /this\.lastResolvedServiceEnv = null;\n\s*this\.startTime = null;\n\s*this\.restartCount = 0;\n\s*this\.lastBackendWasRunning = false;\n\s*this\.currentPhase = StartupPhase\.Idle;/);
    assert.match(source, /return await this\.runDirectLifecycleTransition\('restart'\);/);
  });

  it('starts and observes only the Desktop-owned managed .NET backend', async () => {
    const webServiceSource = await fs.readFile(webServiceManagerPath, 'utf-8');
    assert.match(webServiceSource, /this\.pathManager\.getEmbeddedDotnetPath\(\)/);
    assert.match(webServiceSource, /this\.backendProcessOwner\.start\(launch\)/);
    assert.match(webServiceSource, /this\.backendProcessOwner\.snapshot/);
    assert.match(webServiceSource, /this\.performHealthCheck\(\)/);
    assert.doesNotMatch(webServiceSource, /PM2|pm2|HagiscriptServerManager|resolveStartupEnvironment/);
  });

  it('reports auxiliary service management as external rather than invoking Desktop PM2 lifecycle', async () => {
    const source = await fs.readFile(
      path.resolve(process.cwd(), 'src/main/non-interactive-runtime-lifecycle.ts'),
      'utf-8',
    );
    assert.match(source, /auxiliaryManagement: 'external'/);
  });

  it('keeps Desktop-managed environment injection authoritative over legacy config env values', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /resolveTurboEngineDlcProgramOption\?: \(\(\) => \{ enabled: boolean \| null; source: string \| null \} \| null\) \| null/);
    assert.match(source, /const turboEngineDlcProgramOption = this\.resolveTurboEngineDlcProgramOption\?\.\(\) \?\? null;/);
    assert.match(source, /turboEngineDlcEnabled: turboEngineDlcProgramOption\?\.enabled \?\? null,/);
    assert.match(source, /turboEngineDlcSource: turboEngineDlcProgramOption\?\.source \?\? null,/);
    assert.match(source, /MANAGED_ENV_VAR_DEFINITIONS\.some\(item => item\.key === key\)/);
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

  it('coalesces status polls and only logs health-check transitions', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /if \(this\.statusRequestPromise\) \{\s*return await this\.statusRequestPromise;/s);
    assert.match(source, /const owned = this\.backendProcessOwner\.snapshot;/);
    assert.equal(source.includes("private lastHealthCheckLogState: 'healthy' | 'unhealthy' | null = null;"), true);
    assert.equal(source.includes("if (this.lastHealthCheckLogState !== 'healthy') {"), true);
    assert.equal(source.includes("this.lastHealthCheckLogState = 'healthy';"), true);
    assert.equal(source.includes("if (this.lastHealthCheckLogState !== 'unhealthy') {"), true);
    assert.equal(source.includes("this.lastHealthCheckLogState = 'unhealthy';"), true);
    assert.equal(source.includes('launchContext = await this.resolveDirectBackendLaunchContext();'), true);
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

  it('routes Windows command-wrapper executables through shell mode', () => {
    assert.equal(shouldUseShellForCommand('C:\\Program Files\\nodejs\\node.exe', 'win32'), false);
    assert.equal(shouldUseShellForCommand('C:\\Users\\Test\\AppData\\Roaming\\npm\\npm.cmd', 'win32'), true);
  });

  it('quotes Windows absolute wrapper commands under Program Files roots before routing them through shell execution', () => {
    const npmLaunch = resolveCommandLaunch(
      'C:\\Program Files\\nodejs\\npm.cmd',
      'win32',
    );
    const hagiscriptLaunch = resolveCommandLaunch(
      'C:\\Program Files\\Hagicode\\bin\\hagiscript.cmd',
      'win32',
    );
    const batchLaunch = resolveCommandLaunch(
      'C:\\Program Files\\Hagicode\\bin\\managed-tool.bat',
      'win32',
    );
    const nodeLaunch = resolveCommandLaunch(
      'C:\\Program Files\\nodejs\\node.exe',
      'win32',
    );

    assert.equal(npmLaunch.command, '"C:\\Program Files\\nodejs\\npm.cmd"');
    assert.equal(npmLaunch.shell, true);
    assert.equal(hagiscriptLaunch.command, '"C:\\Program Files\\Hagicode\\bin\\hagiscript.cmd"');
    assert.equal(hagiscriptLaunch.shell, true);
    assert.equal(batchLaunch.command, '"C:\\Program Files\\Hagicode\\bin\\managed-tool.bat"');
    assert.equal(batchLaunch.shell, true);
    assert.equal(nodeLaunch.command, 'C:\\Program Files\\nodejs\\node.exe');
    assert.equal(nodeLaunch.shell, false);
  });

  it('keeps port checks as direct executable arguments rather than opting into chain mode', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /command = 'netstat';\s*args = \['-an'\];\s*shell = true;/);
    assert.match(source, /args = \['-c', `ss -tuln \| grep/);
    assert.doesNotMatch(source, /commandChain:/);
  });
});
