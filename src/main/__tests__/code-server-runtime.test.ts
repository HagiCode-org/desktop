import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCodeServerWrapperPath } from '../code-server-runtime.js';

describe('code-server runtime wrapper resolution', () => {
  const config = {
    expectedLayout: {
      wrapperCandidates: [
        'bin/code-server',
        'bin/code-server.cmd',
        'bin/code-server.ps1',
      ],
    },
  } as const;

  it('prefers Windows command wrappers over the POSIX shim', () => {
    const existing = new Set([
      '/runtime/bin/code-server',
      '/runtime/bin/code-server.cmd',
    ]);

    const resolved = resolveCodeServerWrapperPath(
      '/runtime',
      config as never,
      'win32',
      (targetPath) => existing.has(targetPath),
    );

    assert.equal(resolved, '/runtime/bin/code-server.cmd');
  });

  it('keeps the POSIX wrapper preference on non-Windows platforms', () => {
    const existing = new Set([
      '/runtime/bin/code-server',
      '/runtime/bin/code-server.cmd',
    ]);

    const resolved = resolveCodeServerWrapperPath(
      '/runtime',
      config as never,
      'linux',
      (targetPath) => existing.has(targetPath),
    );

    assert.equal(resolved, '/runtime/bin/code-server');
  });
});
