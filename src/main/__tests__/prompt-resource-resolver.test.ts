import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { PromptResourceResolver } from '../prompt-resource-resolver.js';

const runtime = {
  isPackaged: false,
  appPath: '/app-root',
  cwd: '/workspace',
};

describe('PromptResourceResolver', () => {
  it('prefers active version prompt path before fallback paths', async () => {
    const hitPath = path.normalize('/versions/hagicode-1/config/config-prompt.llm.txt');
    const resolver = new PromptResourceResolver(async (candidatePath) => candidatePath === hitPath);

    const result = await resolver.resolve({
      resourceKey: 'smartConfig',
      runtime,
      activeVersion: {
        id: 'hagicode-1',
        installedPath: '/versions/hagicode-1',
      },
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.source, 'active-version');
      assert.equal(result.resolvedPath, hitPath);
      assert.equal(result.attemptedPaths[0], hitPath);
    }
  });

  it('falls back to development path when active version path is missing', async () => {
    const expectedPath = path.normalize('/workspace/scripts/diagnosis-prompt.llm.txt');
    const resolver = new PromptResourceResolver(async (candidatePath) => candidatePath === expectedPath);

    const result = await resolver.resolve({
      resourceKey: 'diagnosis',
      runtime,
      activeVersion: {
        id: 'hagicode-1',
        installedPath: '/versions/hagicode-1',
      },
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.source, 'development-root');
      assert.equal(result.resolvedPath, expectedPath);
      assert.ok(result.attemptedPaths.includes(expectedPath));
    }
  });

  it('returns structured diagnostics when prompt is missing', async () => {
    const resolver = new PromptResourceResolver(async () => false);

    const result = await resolver.resolve({
      resourceKey: 'smartConfig',
      runtime,
      activeVersion: null,
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.errorCode, 'PROMPT_NOT_FOUND');
      assert.ok(result.attemptedPaths.length > 0);
      assert.equal(result.resourceKey, 'smartConfig');
    }
  });
});

