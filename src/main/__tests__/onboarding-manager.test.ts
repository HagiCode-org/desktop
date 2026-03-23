import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { OnboardingManager } from '../onboarding-manager.js';

const onboardingManagerPath = path.resolve(process.cwd(), 'src/main/onboarding-manager.ts');

function createStoreStub() {
  return {
    get: () => ({ isSkipped: false, isCompleted: false }),
    set: () => undefined,
    delete: () => undefined,
  };
}

describe('onboarding-manager spawn invocation', () => {
  it('routes Windows .cmd commands through cmd.exe', () => {
    const invocation = (OnboardingManager as unknown as {
      buildSpawnInvocation: (
        command: string,
        args: string[],
        platform?: NodeJS.Platform,
      ) => { command: string; args: string[]; shell?: boolean };
    }).buildSpawnInvocation('openspec.cmd', ['--version'], 'win32');

    assert.equal(invocation.command, 'openspec.cmd');
    assert.deepEqual(invocation.args, ['--version']);
    assert.equal(invocation.shell, true);
  });

  it('keeps non-Windows commands unchanged', () => {
    const invocation = (OnboardingManager as unknown as {
      buildSpawnInvocation: (
        command: string,
        args: string[],
        platform?: NodeJS.Platform,
      ) => { command: string; args: string[]; shell?: boolean };
    }).buildSpawnInvocation('openspec', ['--version'], 'linux');

    assert.equal(invocation.command, 'openspec');
    assert.deepEqual(invocation.args, ['--version']);
    assert.equal(invocation.shell, undefined);
  });
});

describe('onboarding-manager OpenSpec verification', () => {
  it('merges console env values ahead of the verification command', () => {
    const mergedEnv = (OnboardingManager as unknown as {
      mergeRuntimeEnv: (
        baseEnv: NodeJS.ProcessEnv,
        consoleEnv: Record<string, string>,
      ) => NodeJS.ProcessEnv;
    }).mergeRuntimeEnv(
      { PATH: '/usr/bin', HOME: '/tmp/home' },
      { PATH: '/profile/bin', OPENSPEC_HOME: '/profile/openspec' },
    );

    assert.equal(mergedEnv.PATH, '/profile/bin');
    assert.equal(mergedEnv.HOME, '/tmp/home');
    assert.equal(mergedEnv.OPENSPEC_HOME, '/profile/openspec');
  });

  it('uses the provided runtime env when verifying OpenSpec', async () => {
    const manager = new OnboardingManager(
      {} as any,
      {} as any,
      {} as any,
      createStoreStub() as any,
    ) as unknown as {
      verifyOpenSpecWithEnv: (env: NodeJS.ProcessEnv) => Promise<{ success: boolean; version?: string; error?: string }>;
      runCommand: (
        command: string,
        args: string[],
        env: NodeJS.ProcessEnv,
      ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
    };

    let capturedEnv: NodeJS.ProcessEnv | undefined;
    manager.runCommand = async (_command, _args, env) => {
      capturedEnv = env;
      return {
        exitCode: 0,
        stdout: 'OpenSpec CLI 1.1.0\n',
        stderr: '',
      };
    };

    const result = await manager.verifyOpenSpecWithEnv({
      PATH: '/profile/bin',
      OPENSPEC_HOME: '/profile/openspec',
    });

    assert.deepEqual(result, { success: true, version: '1.1.0' });
    assert.equal(capturedEnv?.PATH, '/profile/bin');
    assert.equal(capturedEnv?.OPENSPEC_HOME, '/profile/openspec');
  });

  it('preserves command diagnostics when OpenSpec verification fails', async () => {
    const manager = new OnboardingManager(
      {} as any,
      {} as any,
      {} as any,
      createStoreStub() as any,
    ) as unknown as {
      verifyOpenSpecWithEnv: (env: NodeJS.ProcessEnv) => Promise<{ success: boolean; version?: string; error?: string }>;
      runCommand: (
        command: string,
        args: string[],
        env: NodeJS.ProcessEnv,
      ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
    };

    manager.runCommand = async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'spawn openspec ENOENT',
    });

    const result = await manager.verifyOpenSpecWithEnv({ PATH: '/profile/bin' });

    assert.deepEqual(result, {
      success: false,
      error: 'spawn openspec ENOENT',
    });
  });
});

describe('onboarding-manager portable version mode', () => {
  it('treats portable version mode as already provisioned and skips OpenSpec guidance', async () => {
    const source = await fs.readFile(onboardingManagerPath, 'utf-8');

    assert.match(source, /Portable version mode active, treating runtime as already provisioned/);
    assert.match(source, /PORTABLE_VERSION_OPENSPEC_ERROR/);
    assert.match(source, /OpenSpec installation skipped in portable version mode/);
    assert.match(source, /OpenSpec verification skipped in portable version mode/);
  });
});
