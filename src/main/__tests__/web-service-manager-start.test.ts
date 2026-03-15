import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildStartupFailurePayload } from '../startup-failure-payload.js';
import type { StartResult } from '../manifest-reader.js';

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
    assert.match(source, /spawn\(launchContext\.dotnetPath, spawnArgs/);
    assert.match(source, /const spawnArgs = \[launchContext\.serviceDllPath, \.\.\.\(this\.config\.args \|\| \[\]\)\]/);
    assert.match(source, /serviceWorkingDirectory: path\.dirname\(payloadValidation\.payloadPaths\.serviceDllPath\)/);
    assert.match(source, /cwd: launchContext\.serviceWorkingDirectory/);
    assert.match(source, /DOTNET_ROOT: runtimeRoot/);
    assert.match(source, /DOTNET_MULTILEVEL_LOOKUP: '0'/);
    assert.match(source, /includes pinned runtime root/);
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
});
