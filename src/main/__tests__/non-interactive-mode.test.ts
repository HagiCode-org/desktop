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
    generatedAt: '2026-04-28T00:00:00.000Z',
  };
}

function createResult(stage: CliDependencyInstallResult['stage'], success: boolean, error?: string): CliDependencyInstallResult {
  const snapshot = createSnapshot();
  return {
    success,
    stage,
    requestedPackageIds: ['claude-code', 'codex'],
    bootstrapPerformed: true,
    statuses: [],
    verifications: success
      ? [
        {
          packageId: 'hagiscript',
          status: 'installed',
          packageRoot: `${snapshot.environment.npmGlobalModulesRoot}/@hagicode/hagiscript`,
          executablePath: `${snapshot.environment.npmGlobalBinRoot}/hagiscript`,
          packageRootUnderManagedModules: true,
          executableUnderManagedBin: true,
          resolvedCommandPath: `${snapshot.environment.npmGlobalBinRoot}/hagiscript`,
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
      omniRoute: '/tmp/Hagi Code/userData/runtimeData/components/services/omniroute',
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
        root: '/artifact/resources/extra/runtime/components/bundled/code-server/current',
        wrapperPath: '/artifact/resources/extra/runtime/components/bundled/code-server/current/bin/code-server',
        entryScriptPath: '/artifact/resources/extra/runtime/components/bundled/code-server/current/out/node/entry.js',
        version: '4.99.0',
        issues: ok ? [] : ['code-server wrapper missing'],
      },
      omniRoute: {
        ok,
        status: ok ? 'ok' : 'damaged',
        root: '/artifact/resources/extra/runtime/components/bundled/omniroute/current',
        wrapperPath: '/artifact/resources/extra/runtime/components/bundled/omniroute/current/bin/omniroute',
        entryScriptPath: '/artifact/resources/extra/runtime/components/bundled/omniroute/current/dist/index.js',
        version: '0.1.0',
        issues: ok ? [] : ['omniroute wrapper missing'],
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
      hagiscriptPackageRoot: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/lib/node_modules/@hagicode/hagiscript',
      hagiscriptExecutablePath: '/tmp/Hagi Code/userData/runtimeData/node/node22/npmGlobal/bin/hagiscript',
      hagiscriptPackageVersion: '0.9.0',
      hagiscriptPackageUnderManagedModules: true,
      hagiscriptExecutableUnderManagedBin: true,
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
        startSuccess: ok,
        statusAfterStart: ok ? 'online' : 'errored',
        stopSuccess: ok,
        statusAfterStop: 'stopped',
        diagnostics: ok ? [] : ['code-server diagnostic: start failed'],
      },
      omniRoute: {
        pm2Home: '/tmp/Hagi Code/userData/runtimeData/components/services/omniroute/pm2/7',
        runtimeDataHome: '/tmp/Hagi Code/userData/runtimeData/components/services/omniroute',
        runtimeFilesDir: '/tmp/Hagi Code/userData/runtimeData/components/services/omniroute/runtime',
        startSuccess: ok,
        statusAfterStart: ok ? 'online' : 'errored',
        stopSuccess: ok,
        statusAfterStop: 'stopped',
        diagnostics: ok ? [] : ['omniroute diagnostic: start failed'],
      },
      backend: {
        pm2Home: '/tmp/Hagi Code/userData/apps/data/.pm2',
        runtimeDataHome: '/tmp/Hagi Code/userData/apps/data',
        runtimeFilesDir: '/tmp/Hagi Code/userData/apps/data/pm2-runtime',
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
    issues: ok ? [] : ['backend failed to restart under Desktop-managed hagiscript runtime.'],
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
      assert.equal(result.command.kind, 'deps-install');
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('accepts --pm2 alongside agent CLI dependency flags', () => {
    const result = parseNonInteractiveCommand([
      '/opt/Hagicode Desktop/hagicode',
      'deps',
      'install',
      '--pm2',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.command.packageIds, ['pm2', 'claude-code', 'codex']);
    }
  });

  it('parses runtime verify without extra arguments', () => {
    const result = parseNonInteractiveCommand([
      '/opt/Hagicode Desktop/hagicode',
      'runtime',
      'verify',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok) {
      assert.equal(result.command.kind, 'runtime-verify');
      assert.deepEqual(result.userArgs, ['runtime', 'verify']);
    }
  });

  it('parses runtime lifecycle without extra arguments', () => {
    const result = parseNonInteractiveCommand([
      '/opt/Hagicode Desktop/hagicode',
      'runtime',
      'lifecycle',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok) {
      assert.equal(result.command.kind, 'runtime-lifecycle');
      assert.deepEqual(result.userArgs, ['runtime', 'lifecycle']);
    }
  });

  it('ignores supported Electron runtime switches before the non-interactive command', () => {
    const result = parseNonInteractiveCommand([
      '/opt/Hagicode Desktop/hagicode',
      '--headless',
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--ozone-platform=headless',
      '--hagicode-non-interactive-integration',
      '--hagicode-user-data-dir=/tmp/Hagi Code/userData',
      '--hagicode-non-interactive-log-path=/tmp/Hagi Code/userData/non-interactive.log',
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.userArgs, ['deps', 'install', '--claude-code', '--codex']);
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('ignores the macOS LaunchServices psn prefix before the non-interactive command', () => {
    const result = parseNonInteractiveCommand([
      '/Applications/Hagicode Desktop.app/Contents/MacOS/Hagicode Desktop',
      '-psn_0_12345',
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.userArgs, ['deps', 'install', '--claude-code', '--codex']);
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('ignores generic macOS launch flags and their values before the non-interactive command', () => {
    const result = parseNonInteractiveCommand([
      '/Applications/Hagicode Desktop.app/Contents/MacOS/Hagicode Desktop',
      '-ApplePersistenceIgnoreState',
      'YES',
      '-NSDocumentRevisionsDebugMode',
      'YES',
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.userArgs, ['deps', 'install', '--claude-code', '--codex']);
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('strips repeated executable and runtime argv prefixes before parsing the command', () => {
    const result = parseNonInteractiveCommand([
      '/tmp/Hagicode Desktop/hagicode-desktop',
      '--headless',
      '/tmp/Hagicode Desktop/hagicode-desktop',
      '--disable-gpu',
      '--ozone-platform=headless',
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.userArgs, ['deps', 'install', '--claude-code', '--codex']);
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('ignores bootstrap entrypoints before the non-interactive command', () => {
    const result = parseNonInteractiveCommand([
      '/tmp/Hagicode Desktop/node',
      '/tmp/Hagicode Desktop/dist/main/bootstrap.js',
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok && result.command.kind === 'deps-install') {
      assert.deepEqual(result.userArgs, ['deps', 'install', '--claude-code', '--codex']);
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('rejects unsupported command names, unsupported flags, duplicate flags, invalid runtime subcommands, and empty package selections', () => {
    const unsupportedCommand = parseNonInteractiveCommand(['hagicode', 'sync', 'install']);
    assert.equal(unsupportedCommand.handled, true);
    assert.equal(unsupportedCommand.ok, false);

    const unsupportedFlag = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--unknown']);
    assert.equal(unsupportedFlag.handled, true);
    assert.equal(unsupportedFlag.ok, false);
    assert.match(unsupportedFlag.handled && !unsupportedFlag.ok ? unsupportedFlag.error : '', /Unsupported deps install flag/);

    const duplicateFlag = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--codex', '--codex']);
    assert.equal(duplicateFlag.handled, true);
    assert.equal(duplicateFlag.ok, false);
    assert.match(duplicateFlag.handled && !duplicateFlag.ok ? duplicateFlag.error : '', /Duplicate deps install flag/);

    const emptySelection = parseNonInteractiveCommand(['hagicode', 'deps', 'install']);
    assert.equal(emptySelection.handled, true);
    assert.equal(emptySelection.ok, false);
    assert.match(emptySelection.handled && !emptySelection.ok ? emptySelection.error : '', /requires at least one/);

    const badRuntimeSubcommand = parseNonInteractiveCommand(['hagicode', 'runtime', 'inspect']);
    assert.equal(badRuntimeSubcommand.handled, true);
    assert.equal(badRuntimeSubcommand.ok, false);
    assert.match(badRuntimeSubcommand.handled && !badRuntimeSubcommand.ok ? badRuntimeSubcommand.error : '', /Unsupported runtime command/);

    const extraRuntimeArgs = parseNonInteractiveCommand(['hagicode', 'runtime', 'verify', '--verbose']);
    assert.equal(extraRuntimeArgs.handled, true);
    assert.equal(extraRuntimeArgs.ok, false);
    assert.match(extraRuntimeArgs.handled && !extraRuntimeArgs.ok ? extraRuntimeArgs.error : '', /does not accept extra arguments/);

    const extraLifecycleArgs = parseNonInteractiveCommand(['hagicode', 'runtime', 'lifecycle', '--verbose']);
    assert.equal(extraLifecycleArgs.handled, true);
    assert.equal(extraLifecycleArgs.ok, false);
    assert.match(extraLifecycleArgs.handled && !extraLifecycleArgs.ok ? extraLifecycleArgs.error : '', /does not accept extra arguments/);
  });

  it('preserves normal startup when no supported non-interactive command is present', () => {
    assert.deepEqual(parseNonInteractiveCommand(['/opt/Hagicode Desktop/hagicode']), {
      handled: false,
      reason: 'no-command',
    });
    assert.deepEqual(parseNonInteractiveCommand(['/opt/Hagicode Desktop/hagicode', '--squirrel-firstrun']), {
      handled: false,
      reason: 'no-command',
    });
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
    assert.match(stdout.join('\n'), /runtime service code-server data: \/tmp\/Hagi Code\/userData\/runtimeData\/components\/services\/code-server/);
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
    assert.match(stdout.join('\n'), /hagiscript executable managed: true/);
    assert.match(stdout.join('\n'), /code-server status after start: online/);
    assert.match(stdout.join('\n'), /backend status after restart: online/);
    assert.match(stdout.join('\n'), /result: success/);
  });

  it('maps usage, bootstrap, install, and verification failures to stderr and deterministic exit codes', async () => {
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
      ['bootstrap', nonInteractiveExitCodes.bootstrap],
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

  it('maps failed runtime verification to stderr and exit code 72', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const parseResult = parseNonInteractiveCommand(['hagicode', 'runtime', 'verify']);
    const result = await runNonInteractiveCommand(parseResult, {
      runtimeVerifier: async () => createRuntimeVerificationReport(false),
      output: {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      },
    });

    assert.equal(result.exitCode, nonInteractiveExitCodes.verification);
    assert.match(stdout.join('\n'), /runtime component dotnet issues: dotnet runtime missing metadata/);
    assert.match(stderr.join('\n'), /stage: verification/);
    assert.match(stderr.join('\n'), /issue: dotnet runtime missing metadata/);
  });

  it('maps failed runtime lifecycle verification to stderr and exit code 72', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const parseResult = parseNonInteractiveCommand(['hagicode', 'runtime', 'lifecycle']);
    const result = await runNonInteractiveCommand(parseResult, {
      runtimeLifecycleVerifier: async () => createRuntimeLifecycleReport(false),
      output: {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      },
    });

    assert.equal(result.exitCode, nonInteractiveExitCodes.verification);
    assert.match(stdout.join('\n'), /backend restart success: false/);
    assert.match(stderr.join('\n'), /runtime lifecycle verification failed/);
    assert.match(stderr.join('\n'), /backend failed to restart under Desktop-managed hagiscript runtime/);
    assert.match(stderr.join('\n'), /backend diagnostic: restart failed/);
  });

  it('keeps main-process UI startup hooks behind non-interactive detection', async () => {
    const source = await fs.readFile(mainPath, 'utf8');
    const parseIndex = source.indexOf('parseNonInteractiveCommand(process.argv)');
    const lockIndex = source.indexOf('app.requestSingleInstanceLock()');
    const whenReadyIndex = source.indexOf('app.whenReady().then');
    const runIndex = source.indexOf('runNonInteractiveCommand(nonInteractiveParseResult)');
    const createWindowIndex = source.indexOf('createWindow();');
    const createTrayIndex = source.indexOf('createTray();');

    assert.ok(parseIndex >= 0);
    assert.ok(lockIndex > parseIndex);
    assert.ok(whenReadyIndex > parseIndex);
    assert.ok(runIndex > whenReadyIndex);
    assert.ok(createWindowIndex > runIndex);
    assert.ok(createTrayIndex > runIndex);
    assert.match(source, /const gotSingleInstanceLock = nonInteractiveParseResult\.handled\s*\?\s*true\s*:\s*app\.requestSingleInstanceLock\(\);/);
    assert.match(source, /if \(!nonInteractiveParseResult\.handled\) \{\s*app\.on\('second-instance'/);
  });

  it('keeps the packaged entrypoint lightweight before GUI startup imports', async () => {
    const source = await fs.readFile(bootstrapPath, 'utf8');
    const parseIndex = source.indexOf('parseNonInteractiveCommand(process.argv)');
    const runIndex = source.indexOf('runNonInteractiveCommand(nonInteractiveParseResult)');
    const guiImportIndex = source.indexOf("await import('./main.js')");

    assert.ok(parseIndex >= 0);
    assert.ok(runIndex > parseIndex);
    assert.ok(guiImportIndex > parseIndex);
    assert.doesNotMatch(source, /from '\.\/main\.js'/);
    assert.match(source, /if \(nonInteractiveParseResult\.handled\) \{\s*await runNonInteractiveBootstrap\(\);/);
    assert.match(source, /Integration mode did not include a supported command/);
  });
});

describe('runtime lifecycle harness contract', () => {
  it('validates OmniRoute through the hagiscript-managed runtime context instead of the legacy process name', async () => {
    const source = await fs.readFile(runtimeLifecyclePath, 'utf8');

    assert.match(source, /inspectVendoredOmniRouteRuntime/);
    assert.match(source, /resolveOmniRouteLaunchSpec/);
    assert.match(source, /resolveBundledRuntime\(\{\s*service: 'omniroute'/);
    assert.match(source, /collectHagiscriptManagedDiagnostics/);
    assert.match(source, /runtimeContext\.pm2LogsDirectory/);
    assert.match(source, /serviceLabel: 'omniroute'/);
    assert.doesNotMatch(source, /processName: OMNIROUTE_PROCESS_NAME/);
    assert.doesNotMatch(source, /Pm2DotnetManager/);
    assert.doesNotMatch(source, /resolvePm2LaunchPlan/);
  });
  it('validates Code Server through the hagiscript-managed runtime context instead of the legacy process name', async () => {
    const source = await fs.readFile(runtimeLifecyclePath, 'utf8');

    assert.match(source, /inspectVendoredCodeServerRuntime/);
    assert.match(source, /resolveBundledRuntime\(\{\s*service: 'code-server'/);
    assert.match(source, /collectHagiscriptManagedDiagnostics/);
    assert.match(source, /runtimeContext\.pm2LogsDirectory/);
    assert.match(source, /serviceLabel: 'code-server'/);
    assert.doesNotMatch(source, /CODE_SERVER_PROCESS_NAME/);
  });
});

describe('dependency service CLI contract', () => {
  it('bootstraps hagiscript before sync-managed package installation and skips bootstrap when already installed', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /installManagedPackagesForCli\(packageIds: ManagedNpmPackageId\[\]\)/);
    assert.match(source, /const hagiscriptStatus = this\.getHagiscriptStatus\(snapshot\);/);
    assert.match(source, /hagiscriptStatus\?\.status !== 'installed' \|\| !hagiscriptStatus\.executablePath/);
    assert.match(source, /const bootstrapResult = await this\.install\('hagiscript'\);/);
    assert.match(source, /const installResult = await this\.syncPackages\(\{ packageIds: requestedPackageIds \}\);/);
  });

  it('verifies successful installs by refreshed package status, executable path, managed location, and injected PATH resolution', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /verifyManagedPackagesForCli/);
    assert.match(source, /validateInstalledPackageForCli/);
    assert.match(source, /status\?\.status !== 'installed'/);
    assert.match(source, /!status\.executablePath/);
    assert.match(source, /environment\.npmGlobalModulesRoot/);
    assert.match(source, /environment\.npmGlobalBinRoot/);
    assert.match(source, /resolveCommandThroughManagedEnv/);
    assert.match(source, /\['-e', script, definition\.binName\]/);
    assert.doesNotMatch(source, /shell:\s*true/);
  });
});
