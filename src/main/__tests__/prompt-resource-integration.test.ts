import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PromptResourceResolver } from '../prompt-resource-resolver.js';

describe('Prompt resource integration', () => {
  it('resolves smartConfig from the active version root', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-prompt-int-'));
    const versionRoot = path.join(tmpRoot, 'hagicode-1');
    const smartPrompt = path.join(versionRoot, 'config', 'config-prompt.llm.txt');

    await fs.mkdir(path.dirname(smartPrompt), { recursive: true });
    await fs.writeFile(smartPrompt, 'smart config prompt');

    const resolver = new PromptResourceResolver();
    const runtime = {
      isPackaged: false,
      appPath: '/app-root',
      cwd: '/workspace',
    };
    const activeVersion = {
      id: 'hagicode-1',
      installedPath: versionRoot,
    };

    const smartResult = await resolver.resolve({
      resourceKey: 'smartConfig',
      runtime,
      activeVersion,
    });

    assert.equal(smartResult.success, true);
    if (smartResult.success) {
      assert.equal(smartResult.source, 'active-version');
      assert.equal(smartResult.resolvedPath, path.normalize(smartPrompt));
    }
  });
});
