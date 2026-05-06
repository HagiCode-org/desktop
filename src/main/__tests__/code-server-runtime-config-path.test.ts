import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  getCodeServerRuntimeConfigPath,
  resolveCodeServerRuntimeConfigCandidates,
} from '../code-server-runtime-config-path.js';

describe('code-server runtime config path', () => {
  it('checks both workspace and module-relative runtime manifest locations', () => {
    const candidates = resolveCodeServerRuntimeConfigCandidates('/workspace/dist/main', '/workspace');

    assert.deepEqual(candidates, [
      path.resolve('/workspace', 'resources', 'code-server-runtime', 'runtime-manifest.json'),
      path.resolve('/workspace/dist/main', '../../resources/code-server-runtime/runtime-manifest.json'),
    ]);
  });

  it('falls back to the module-relative manifest when the cwd manifest is unavailable', () => {
    const moduleDirectory = '/tmp/Desktop artifact with spaces/resources/app.asar/dist/main';
    const expectedPath = path.resolve(
      moduleDirectory,
      '../../resources/code-server-runtime/runtime-manifest.json',
    );

    const resolvedPath = getCodeServerRuntimeConfigPath({
      cwd: '/tmp/Desktop artifact with spaces',
      moduleDirectory,
      existsSync: (candidate) => candidate === expectedPath,
    });

    assert.equal(resolvedPath, expectedPath);
  });
});
