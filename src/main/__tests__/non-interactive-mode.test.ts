import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  nonInteractiveExitCodes,
  parseNonInteractiveCommand,
  runNonInteractiveCommand,
} from '../non-interactive-mode.js';
import type { NonInteractiveRuntimeVerificationReport } from '../non-interactive-runtime-verify.js';
import type { NonInteractiveRuntimeLifecycleReport } from '../non-interactive-runtime-lifecycle.js';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const bootstrapPath = path.resolve(process.cwd(), 'src/main/bootstrap.ts');
const runtimeLifecyclePath = path.resolve(process.cwd(), 'src/main/non-interactive-runtime-lifecycle.ts');
function createRuntimeVerificationReport(ok: boolean): NonInteractiveRuntimeVerificationReport {
  return {
    ok,
    mode: 'packaged',
    manifestPath: '/artifact/resources/app.asar/resources/manifest.yml',
    programHome: '/artifact/resources/extra/runtime',
    programHomeExists: true,
    dataHome: '/tmp/Hagi Code/.hagicode/runtime-data',
    dataHomeExists: false,
    sharedPaths: {
      config: '/tmp/Hagi Code/.hagicode/runtime-data/config',
      logs: '/tmp/Hagi Code/.hagicode/runtime-data/logs',
      data: '/tmp/Hagi Code/.hagicode/runtime-data/data',
      state: '/tmp/Hagi Code/.hagicode/runtime-data/state',
    },
    components: {
      dotnet: {
        ok,
        status: ok ? 'ok' : 'error',
        root: '/artifact/resources/extra/runtime/components/dotnet/runtime/linux-x64/current',
        executablePath: '/artifact/resources/extra/runtime/components/dotnet/runtime/linux-x64/current/dotnet',
        aspNetCoreVersion: '10.0.0',
        netCoreVersion: '10.0.0',
        hostFxrVersion: '10.0.0',
        runtimeSource: 'https://download.visualstudio.microsoft.com/runtime.tar.gz',
        issues: ok ? [] : ['dotnet runtime missing metadata'],
      },
    },
    issues: ok ? [] : ['dotnet runtime missing metadata'],
  };
}

function createRuntimeLifecycleReport(ok: boolean): NonInteractiveRuntimeLifecycleReport {
  return {
    ok,
    desktopLogsDirectory: '/tmp/Hagi Code/userData/logs',
    backend: {
      activeRuntimeRoot: '/artifact/resources/extra/portable-fixed/current',
      serviceDllPath: '/artifact/resources/extra/portable-fixed/current/lib/PCode.Web.dll',
      serviceWorkingDirectory: '/artifact/resources/extra/portable-fixed/current/lib',
      dotnetExecutablePath: '/artifact/resources/extra/runtime/components/dotnet/runtime/linux-x64/current/dotnet',
      port: 36556,
      skipped: false,
      skipReason: null,
      startSuccess: ok,
      statusAfterStart: ok ? 'running' : 'error',
      pidAfterStart: ok ? 1234 : null,
      restartSuccess: ok,
      statusAfterRestart: ok ? 'running' : 'error',
      pidAfterRestart: ok ? 1235 : null,
      stopSuccess: ok,
      statusAfterStop: 'stopped',
      pidAfterStop: null,
      processIdentityVerified: ok,
      ...(ok ? {} : { error: 'backend diagnostic: restart failed' }),
    },
    auxiliaryManagement: 'external',
    issues: ok ? [] : ['Backend failed to restart under the Desktop-owned .NET process lifecycle.'],
  };
}

describe('non-interactive mode parser', () => {
  it('parses runtime verify and runtime lifecycle without extra arguments', () => {
    const verify = parseNonInteractiveCommand(['hagicode', 'runtime', 'verify']);
    const lifecycle = parseNonInteractiveCommand(['hagicode', 'runtime', 'lifecycle']);

    assert.equal(verify.handled, true);
    assert.equal(verify.ok, true);
    assert.equal(lifecycle.handled, true);
    assert.equal(lifecycle.ok, true);
  });

  it('ignores supported Electron runtime switches before the non-interactive command', () => {
    const result = parseNonInteractiveCommand([
      '/opt/Hagicode Desktop/hagicode',
      '--headless',
      '--disable-gpu',
      '--ozone-platform=headless',
      '--hagicode-non-interactive-integration',
      '--hagicode-user-data-dir=/tmp/Hagi Code/userData',
      'runtime',
      'verify',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
  });

  it('rejects unsupported commands, flags, duplicates, and extra runtime arguments', () => {
    const unsupportedCommand = parseNonInteractiveCommand(['hagicode', 'sync', 'install']);
    const unsupportedFlag = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--unknown']);
    const extraRuntimeArgs = parseNonInteractiveCommand(['hagicode', 'runtime', 'verify', '--verbose']);

    assert.equal(unsupportedCommand.handled, true);
    assert.equal(unsupportedCommand.ok, false);
    assert.equal(unsupportedFlag.handled, true);
    assert.equal(unsupportedFlag.ok, false);
    assert.equal(extraRuntimeArgs.handled, true);
    assert.equal(extraRuntimeArgs.ok, false);
  });
});

describe('non-interactive mode dispatch', () => {
  it('maps successful runtime verification to stdout and exit code 0', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const parseResult = parseNonInteractiveCommand(['hagicode', 'runtime', 'verify']);
    const result = await runNonInteractiveCommand(parseResult, {
      runtimeVerifier: async () => createRuntimeVerificationReport(true),
      output: {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      },
    });

    assert.equal(result.exitCode, nonInteractiveExitCodes.success);
    assert.equal(stderr.length, 0);
    assert.match(stdout.join('\n'), /runtime component dotnet status: ok/);
    assert.match(stdout.join('\n'), /result: success/);
  });

  it('maps successful runtime lifecycle verification to stdout and exit code 0', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const parseResult = parseNonInteractiveCommand(['hagicode', 'runtime', 'lifecycle']);
    const result = await runNonInteractiveCommand(parseResult, {
      runtimeLifecycleVerifier: async () => createRuntimeLifecycleReport(true),
      output: {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      },
    });

    assert.equal(result.exitCode, nonInteractiveExitCodes.success);
    assert.equal(stderr.length, 0);
    assert.match(stdout.join('\n'), /backend lifecycle owner: Desktop-owned \.NET child process/);
    assert.match(stdout.join('\n'), /backend status after restart: running/);
    assert.match(stdout.join('\n'), /backend pid after start: 1234/);
    assert.match(stdout.join('\n'), /backend pid after restart: 1235/);
    assert.match(stdout.join('\n'), /backend pid after stop: null/);
    assert.match(stdout.join('\n'), /backend process identity verified: true/);
    assert.match(stdout.join('\n'), /auxiliary service management: external/);
    assert.match(stdout.join('\n'), /result: success/);
  });

  it('reports a missing packaged backend payload as an explicit lifecycle skip', async () => {
    const stdout: string[] = [];
    const report = createRuntimeLifecycleReport(true);
    report.backend.skipped = true;
    report.backend.skipReason = 'This Desktop package does not contain a portable backend payload.';
    const result = await runNonInteractiveCommand(parseNonInteractiveCommand(['hagicode', 'runtime', 'lifecycle']), {
      runtimeLifecycleVerifier: async () => report,
      output: {
        stdout: (line) => stdout.push(line),
        stderr: () => undefined,
      },
    });

    assert.equal(result.exitCode, nonInteractiveExitCodes.success);
    assert.match(stdout.join('\n'), /backend lifecycle skipped: true/);
    assert.match(stdout.join('\n'), /does not contain a portable backend payload/);
  });

  it('maps usage failures to stderr and deterministic exit codes', async () => {
    const usageStderr: string[] = [];
    const usage = await runNonInteractiveCommand(parseNonInteractiveCommand(['hagicode', 'sync', 'install']), {
      output: {
        stdout: () => undefined,
        stderr: (line) => usageStderr.push(line),
      },
    });
    assert.equal(usage.exitCode, nonInteractiveExitCodes.usage);
    assert.match(usageStderr.join('\n'), /Usage:/);

    assert.equal(usage.exitCode, nonInteractiveExitCodes.usage);
  });

  it('maps failed runtime verification and lifecycle checks to exit code 72', async () => {
    const verificationResult = await runNonInteractiveCommand(parseNonInteractiveCommand(['hagicode', 'runtime', 'verify']), {
      runtimeVerifier: async () => createRuntimeVerificationReport(false),
      output: { stdout: () => undefined, stderr: () => undefined },
    });
    const lifecycleResult = await runNonInteractiveCommand(parseNonInteractiveCommand(['hagicode', 'runtime', 'lifecycle']), {
      runtimeLifecycleVerifier: async () => createRuntimeLifecycleReport(false),
      output: { stdout: () => undefined, stderr: () => undefined },
    });

    assert.equal(verificationResult.exitCode, nonInteractiveExitCodes.verification);
    assert.equal(lifecycleResult.exitCode, nonInteractiveExitCodes.verification);
  });
});

describe('main-process entrypoint contract', () => {
  it('verifies the packaged backend through the Desktop-owned direct .NET manager', async () => {
    const source = await fs.readFile(runtimeLifecyclePath, 'utf8');

    assert.match(source, /new PCodeWebServiceManager/);
    assert.match(source, /await manager\.start\(\)/);
    assert.match(source, /await manager\.restart\(\)/);
    assert.match(source, /await manager\.stop\(\)/);
    assert.match(source, /await manager\.cleanup\(\)/);
    assert.match(source, /auxiliaryManagement: 'external'/);
    assert.doesNotMatch(source, /HagiscriptServerManager|pm2/i);
  });

  it('keeps main-process UI startup hooks behind non-interactive detection', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /parseNonInteractiveCommand\(process\.argv\)/);
    assert.match(source, /runNonInteractiveCommand\(nonInteractiveParseResult\)/);
    assert.match(source, /createWindow\(\);/);
    assert.match(source, /createTray\(\);/);
    assert.match(source, /exitNonInteractiveProcess\(result\.exitCode\);/);
  });

  it('keeps the packaged bootstrap entrypoint lightweight before GUI startup imports', async () => {
    const source = await fs.readFile(bootstrapPath, 'utf8');

    assert.match(source, /parseNonInteractiveCommand\(process\.argv\)/);
    assert.match(source, /runNonInteractiveBootstrap\(\)/);
    assert.match(source, /await import\('\.\/main\.js'\)/);
  });
});
