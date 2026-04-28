import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  nonInteractiveExitCodes,
  parseNonInteractiveCommand,
  runNonInteractiveCommand,
} from '../non-interactive-mode.js';
import type {
  DependencyManagementOperationProgress,
  DependencyManagementSnapshot,
  ManagedNpmPackageId,
} from '../../types/dependency-management.js';
import type { CliDependencyInstallResult } from '../dependency-management-service.js';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const servicePath = path.resolve(process.cwd(), 'src/main/dependency-management-service.ts');

function createSnapshot(): DependencyManagementSnapshot {
  return {
    environment: {
      available: true,
      toolchainRoot: '/tmp/Hagi Code/toolchain',
      nodeRuntimeRoot: '/tmp/Hagi Code/toolchain/node',
      nodeVersion: '22.0.0',
      nodeMajorVersion: '22',
      npmGlobalPrefix: '/tmp/Hagi Code/userData/node22/npmGlobal',
      npmGlobalBinRoot: '/tmp/Hagi Code/userData/node22/npmGlobal/bin',
      npmGlobalModulesRoot: '/tmp/Hagi Code/userData/node22/npmGlobal/lib/node_modules',
      npmCacheRoot: '/tmp/Hagi Code/userData/node22/npmCache',
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
    if (result.handled && result.ok) {
      assert.equal(result.command.kind, 'deps-install');
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('ignores supported Electron runtime switches before the non-interactive command', () => {
    const result = parseNonInteractiveCommand([
      '/opt/Hagicode Desktop/hagicode',
      '--headless',
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--ozone-platform=headless',
      'deps',
      'install',
      '--claude-code',
      '--codex',
    ]);

    assert.equal(result.handled, true);
    assert.equal(result.ok, true);
    if (result.handled && result.ok) {
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
    if (result.handled && result.ok) {
      assert.deepEqual(result.userArgs, ['deps', 'install', '--claude-code', '--codex']);
      assert.deepEqual(result.command.packageIds, ['claude-code', 'codex']);
    }
  });

  it('rejects unsupported command names, unsupported flags, duplicate flags, and empty package selections', () => {
    const unsupportedCommand = parseNonInteractiveCommand(['hagicode', 'sync', 'install']);
    assert.equal(unsupportedCommand.handled, true);
    assert.equal(unsupportedCommand.ok, false);

    const unsupportedFlag = parseNonInteractiveCommand(['hagicode', 'deps', 'install', '--pm2']);
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
