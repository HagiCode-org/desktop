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
import type {
  DependencyManagementOperationProgress,
  DependencyManagementSnapshot,
  ManagedNpmPackageId,
} from '../../types/dependency-management.js';
import type { CliDependencyInstallResult } from '../dependency-management-service.js';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const bootstrapPath = path.resolve(process.cwd(), 'src/main/bootstrap.ts');
const servicePath = path.resolve(process.cwd(), 'src/main/dependency-management-service.ts');
const runtimeLifecyclePath = path.resolve(process.cwd(), 'src/main/non-interactive-runtime-lifecycle.ts');

function createSnapshot(): DependencyManagementSnapshot {
  return {
    environment: {
      available: true,
      toolchainRoot: '/tmp/Hagi Code/toolchain',
      nodeRuntimeRoot: '/tmp/Hagi Code/toolchain/node',
      nodeVersion: '22.0.0',
      nodeMajorVersion: '22',
      npmGlobalPrefix: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal',
      npmGlobalBinRoot: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/bin',
      npmGlobalModulesRoot: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/lib/node_modules',
      npmCacheRoot: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmCache',
      node: {
        status: 'available',
        executablePath: '/tmp/Hagi Code/toolchain/node/bin/node',
        version: '22.0.0',
      },
      npm: {
        status: 'available',
        executablePath: '/tmp/Hagi Code/toolchain/node/lib/node_modules/npm/bin/npm-cli.js',
        version: '10.0.0',
      },
    },
    packages: [],
    vendoredRuntimes: [],
    mirrorSettings: {
      enabled: false,
      registryUrl: null,
    },
    activeOperation: null,
    activeRuntimeActivation: null,
    generatedAt: '2026-04-28T00:00:00.000Z',
  };
}

function createResult(stage: CliDependencyInstallResult['stage'], success: boolean, error?: string): CliDependencyInstallResult {
  const snapshot = createSnapshot();
  return {
    success,
    stage,
    requestedPackageIds: ['claude-code', 'codex'],
    statuses: [],
    verifications: success
      ? [
        {
          packageId: 'pm2',
          status: 'installed',
          packageRoot: `${snapshot.environment.npmGlobalModulesRoot}/pm2`,
          executablePath: `${snapshot.environment.npmGlobalBinRoot}/pm2`,
          packageRootUnderManagedModules: true,
          executableUnderManagedBin: true,
          resolvedCommandPath: `${snapshot.environment.npmGlobalBinRoot}/pm2`,
          commandResolvesThroughManagedPath: true,
        },
        {
          packageId: 'claude-code',
          status: 'installed',
          packageRoot: `${snapshot.environment.npmGlobalModulesRoot}/@anthropic-ai/claude-code`,
          executablePath: `${snapshot.environment.npmGlobalBinRoot}/claude`,
          packageRootUnderManagedModules: true,
          executableUnderManagedBin: true,
          resolvedCommandPath: `${snapshot.environment.npmGlobalBinRoot}/claude`,
          commandResolvesThroughManagedPath: true,
        },
      ]
      : [],
    snapshot,
    error,
  };
}

function createService(result: CliDependencyInstallResult) {
  return {
    onProgress(listener: (event: DependencyManagementOperationProgress) => void): () => void {
      listener({
        packageId: 'claude-code',
        operation: 'sync',
        stage: 'started',
        message: 'sync Claude Code started',
        percentage: 0,
        timestamp: '2026-04-28T00:00:00.000Z',
      });
      return () => undefined;
    },
    async installManagedPackagesForCli(packageIds: ManagedNpmPackageId[]): Promise<CliDependencyInstallResult> {
      assert.deepEqual(packageIds, ['claude-code', 'codex']);
      return result;
    },
  };
}

function createRuntimeVerificationReport(ok: boolean): NonInteractiveRuntimeVerificationReport {
  return {
    ok,
    mode: 'packaged',
    manifestPath: '/artifact/resources/app.asar/resources/manifest.yml',
    programHome: '/artifact/resources/extra/runtime',
    programHomeExists: true,
    dataHome: '/tmp/Hagi Code/userData/runtimeData',
    dataHomeExists: false,
    sharedPaths: {
      config: '/tmp/Hagi Code/userData/runtimeData/config',
      logs: '/tmp/Hagi Code/userData/runtimeData/logs',
      data: '/tmp/Hagi Code/userData/runtimeData/data',
      state: '/tmp/Hagi Code/userData/runtimeData/state',
    },
    serviceDataHomes: {
      codeServer: '/tmp/Hagi Code/userData/runtimeData/components/services/code-server',
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
      node: {
        ok,
        status: ok ? 'ok' : 'error',
        root: '/artifact/resources/extra/runtime/components/node/runtime',
        manifestPath: '/artifact/resources/manifest.yml',
        activeForDesktop: true,
        nodeExecutablePath: '/artifact/resources/extra/runtime/components/node/runtime/bin/node',
        npmExecutablePath: '/artifact/resources/extra/runtime/components/node/runtime/lib/node_modules/npm/bin/npm-cli.js',
        governedNodeVersion: '22.0.0',
        issues: ok ? [] : ['bundled Node runtime metadata is missing or invalid'],
      },
      codeServer: {
        ok,
        status: ok ? 'ok' : 'damaged',
        root: '/tmp/Hagi Code/userData/runtimeData/runtimeComponents/code_server/4.99.0/current',
        wrapperPath: '/tmp/Hagi Code/userData/runtimeData/runtimeComponents/code_server/4.99.0/current/bin/code-server',
        entryScriptPath: '/tmp/Hagi Code/userData/runtimeData/runtimeComponents/code_server/4.99.0/current/out/node/entry.js',
        version: '4.99.0',
        issues: ok ? [] : ['code-server wrapper missing'],
      },
    },
    issues: ok ? [] : ['dotnet runtime missing metadata', 'bundled Node runtime metadata is missing or invalid'],
  };
}

function createRuntimeLifecycleReport(ok: boolean): NonInteractiveRuntimeLifecycleReport {
  return {
    ok,
    desktopLogsDirectory: '/tmp/Hagi Code/userData/logs',
    tooling: {
      npmGlobalPrefix: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal',
      npmGlobalBinRoot: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/bin',
      npmGlobalModulesRoot: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/lib/node_modules',
      pm2PackageRoot: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/lib/node_modules/pm2',
      pm2ExecutablePath: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/bin/pm2',
      pm2PackageVersion: '7.0.1',
      pm2PackageUnderManagedModules: true,
      pm2ExecutableUnderManagedBin: true,
    },
    services: {
      codeServer: {
        pm2Home: '/tmp/Hagi Code/userData/runtimeData/components/services/code-server/pm2/7',
        runtimeDataHome: '/tmp/Hagi Code/userData/runtimeData/components/services/code-server',
        runtimeFilesDir: '/tmp/Hagi Code/userData/runtimeData/components/services/code-server/runtime',
        launchScriptPath: '/tmp/hagicode-desktop-path-alias/desktop-code-server-script-123456789abc',
        launchWorkingDirectory: '/tmp/hagicode-desktop-path-alias/desktop-code-server-working-directory-123456789abc',
        startSuccess: ok,
        statusAfterStart: ok ? 'online' : 'errored',
        stopSuccess: ok,
        statusAfterStop: 'stopped',
        diagnostics: ok ? [] : ['code-server diagnostic: start failed'],
      },
      backend: {
        pm2Home: '/tmp/Hagi Code/userData/apps/data/.pm2',
        runtimeDataHome: '/tmp/Hagi Code/userData/apps/data',
        runtimeFilesDir: '/tmp/Hagi Code/userData/apps/data/pm2-runtime',
        launchScriptPath: null,
        launchWorkingDirectory: null,
        activeRuntimeRoot: '/artifact/resources/extra/portable-fixed/current',
        serviceDllPath: '/artifact/resources/extra/portable-fixed/current/lib/PCode.Web.dll',
        serviceWorkingDirectory: '/artifact/resources/extra/portable-fixed/current/lib',
        requiredRuntimeLabel: '10.0.0',
        skipped: false,
        skipReason: null,
        startSuccess: ok,
        statusAfterStart: ok ? 'online' : 'errored',
        restartSuccess: ok,
        statusAfterRestart: ok ? 'online' : 'errored',
        stopSuccess: ok,
        statusAfterStop: 'stopped',
        diagnostics: ok ? [] : ['backend diagnostic: restart failed'],
      },
    },
    issues: ok ? [] : ['backend failed to restart under the Desktop SDK runtime.'],
  };
}

describe('non-interactive mode parser', () => {
  it('parses deps install --claude-code --codex into managed package IDs', () => {
    const result = parseNonInteractiveCommand([
      '/opt/Hagicode Desktop/hagicode',
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

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
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.userArgs, ['deps', 'install', '--claude-code', '--codex']);
    }
  });

  it('rejects unsupported commands, flags, duplicates, and extra runtime arguments', () => {
    const unsupportedCommand = parseNonInteractiveCommand(['hagicode', 'sync', 'install']);
    const unsupportedFlag = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--unknown']);
    const duplicateFlag = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--codex', '--codex']);
    const emptySelection = parseNonInteractiveCommand(['hagicode', 'deps', 'install']);
    const extraRuntimeArgs = parseNonInteractiveCommand(['hagicode', 'runtime', 'verify', '--verbose']);

    assert.equal(unsupportedCommand.handled, true);
    assert.equal(unsupportedCommand.ok, false);
    assert.equal(unsupportedFlag.handled, true);
    assert.equal(unsupportedFlag.ok, false);
    assert.equal(duplicateFlag.handled, true);
    assert.equal(duplicateFlag.ok, false);
    assert.equal(emptySelection.handled, true);
    assert.equal(emptySelection.ok, false);
    assert.equal(extraRuntimeArgs.handled, true);
    assert.equal(extraRuntimeArgs.ok, false);
  });
});

describe('non-interactive mode dispatch', () => {
  it('maps successful dependency installs to stdout and exit code 0', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const parseResult = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--claude-code', '--codex']);
    const result = await runNonInteractiveCommand(parseResult, {
      service: createService(createResult('success', true)),
      output: {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      },
    });

    assert.equal(result.exitCode, nonInteractiveExitCodes.success);
    assert.equal(stderr.length, 0);
    assert.match(stdout.join('\n'), /requested packages: claude-code, codex/);
    assert.match(stdout.join('\n'), /result: success/);
  });

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
    assert.match(stdout.join('\n'), /runtime component node manifest: \/artifact\/resources\/manifest.yml/);
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
    assert.match(stdout.join('\n'), /standalone pm2 package managed: true/);
    assert.match(stdout.join('\n'), /code-server status after start: online/);
    assert.match(stdout.join('\n'), /backend status after restart: online/);
    assert.match(stdout.join('\n'), /result: success/);
  });

  it('maps usage, install, and verification failures to stderr and deterministic exit codes', async () => {
    const usageStderr: string[] = [];
    const usage = await runNonInteractiveCommand(parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--bad']), {
      output: {
        stdout: () => undefined,
        stderr: (line) => usageStderr.push(line),
      },
    });
    assert.equal(usage.exitCode, nonInteractiveExitCodes.usage);
    assert.match(usageStderr.join('\n'), /Usage:/);

    for (const [stage, exitCode] of [
      ['install', nonInteractiveExitCodes.install],
      ['verification', nonInteractiveExitCodes.verification],
    ] as const) {
      const stderr: string[] = [];
      const parseResult = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--claude-code', '--codex']);
      const result = await runNonInteractiveCommand(parseResult, {
        service: createService(createResult(stage, false, `${stage} failed`)),
        output: {
          stdout: () => undefined,
          stderr: (line) => stderr.push(line),
        },
      });
      assert.equal(result.exitCode, exitCode);
      assert.match(stderr.join('\n'), new RegExp(`stage: ${stage}`));
      assert.match(stderr.join('\n'), new RegExp(`${stage} failed`));
    }
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

describe('runtime lifecycle harness contract', () => {
  it('validates Code Server through the Desktop-managed runtime context instead of the legacy process name', async () => {
    const source = await fs.readFile(runtimeLifecyclePath, 'utf8');

    assert.match(source, /inspectVendoredCodeServerRuntime/);
    assert.match(source, /resolveBundledRuntime\(\{\s*service: 'code-server'/);
    assert.match(source, /collectHagiscriptManagedDiagnostics/);
    assert.match(source, /runtimeContext\.pm2LogsDirectory/);
    assert.doesNotMatch(source, /CODE_SERVER_PROCESS_NAME/);
  });
});

describe('dependency service CLI contract', () => {
  it('injects pm2 into the internal sync set and verifies the synced packages by refreshed status', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /installManagedPackagesForCli\(packageIds: ManagedNpmPackageId\[\]\)/);
    assert.match(source, /const syncPackageIds = this\.resolveCliSyncPackageIds\(requestedPackageIds\);/);
    assert.match(source, /const verificationPackageIds = syncPackageIds;/);
    assert.match(source, /verifyManagedPackagesForCli/);
    assert.match(source, /resolveCommandThroughManagedEnv/);
    assert.doesNotMatch(source, /bootstrapResult/);
    assert.doesNotMatch(source, /getHagiscriptStatus/);
  });
});
