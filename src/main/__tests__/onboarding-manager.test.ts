import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OnboardingManager } from '../onboarding-manager.js';

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
