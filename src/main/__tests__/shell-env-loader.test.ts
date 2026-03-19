import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseNullDelimitedEnv,
  resolveUnixEnvCommand,
  shouldLoadConsoleEnvironment,
} from '../shell-env-loader.js';

describe('shell-env-loader', () => {
  it('parses null-delimited env output', () => {
    const parsed = parseNullDelimitedEnv('A=1\u0000B=hello world\u0000EMPTY=\u0000');
    assert.equal(parsed.A, '1');
    assert.equal(parsed.B, 'hello world');
    assert.equal(parsed.EMPTY, '');
  });

  it('ignores malformed env rows', () => {
    const parsed = parseNullDelimitedEnv('=bad\u0000NO_EQUAL\u0000GOOD=ok\u0000');
    assert.deepEqual(parsed, { GOOD: 'ok' });
  });

  it('handles feature flag values', () => {
    assert.equal(shouldLoadConsoleEnvironment(undefined), true);
    assert.equal(shouldLoadConsoleEnvironment('true'), true);
    assert.equal(shouldLoadConsoleEnvironment('1'), true);
    assert.equal(shouldLoadConsoleEnvironment('false'), false);
    assert.equal(shouldLoadConsoleEnvironment('off'), false);
  });

  it('builds bash profile loading in login-priority order before exporting env', () => {
    const command = resolveUnixEnvCommand('bash');

    assert.deepEqual(command.slice(0, 4), ['--login', '--noprofile', '--norc', '-ic']);

    const script = command[4];
    assert.ok(script);

    const bashProfileIndex = script.indexOf('$HOME/.bash_profile');
    const bashLoginIndex = script.indexOf('$HOME/.bash_login');
    const profileIndex = script.indexOf('$HOME/.profile');
    const bashrcIndex = script.indexOf('$HOME/.bashrc');
    const envIndex = script.indexOf('env -0');

    assert.ok(bashProfileIndex >= 0);
    assert.ok(bashLoginIndex > bashProfileIndex);
    assert.ok(profileIndex > bashLoginIndex);
    assert.ok(bashrcIndex > profileIndex);
    assert.ok(envIndex > bashrcIndex);
  });

  it('builds zsh profile loading before exporting env', () => {
    const command = resolveUnixEnvCommand('zsh');

    assert.deepEqual(command.slice(0, 4), ['-f', '-l', '-i', '-c']);

    const script = command[4];
    assert.ok(script);
    assert.ok(script.indexOf('$HOME/.zprofile') >= 0);
    assert.ok(script.indexOf('$HOME/.zshrc') > script.indexOf('$HOME/.zprofile'));
    assert.ok(script.indexOf('env -0') > script.indexOf('$HOME/.zshrc'));
  });

  it('keeps fish and fallback shells on the existing env export flow', () => {
    assert.deepEqual(resolveUnixEnvCommand('fish'), ['-ic', 'env -0']);
    assert.deepEqual(resolveUnixEnvCommand('sh'), ['-lc', 'env -0']);
  });
});
