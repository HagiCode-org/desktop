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
    }).buildSpawnInvocation('npm.cmd', ['install', '-g', 'some-package'], 'win32');

    assert.equal(invocation.command, 'npm.cmd');
    assert.deepEqual(invocation.args, ['install', '-g', 'some-package']);
    assert.equal(invocation.shell, true);
  });

  it('keeps non-Windows commands unchanged', () => {
    const invocation = (OnboardingManager as unknown as {
      buildSpawnInvocation: (
        command: string,
        args: string[],
        platform?: NodeJS.Platform,
      ) => { command: string; args: string[]; shell?: boolean };
    }).buildSpawnInvocation('npm', ['install', '-g', 'some-package'], 'linux');

    assert.equal(invocation.command, 'npm');
    assert.deepEqual(invocation.args, ['install', '-g', 'some-package']);
    assert.equal(invocation.shell, undefined);
  });
});

describe('onboarding-manager portable version mode', () => {
  it('treats portable version mode as already provisioned and skips onboarding', async () => {
    const source = await fs.readFile(onboardingManagerPath, 'utf-8');

    assert.match(source, /PORTABLE_VERSION_ONBOARDING_ERROR/);
    assert.match(source, /Portable version mode active, treating runtime as already provisioned/);
  });
});
