import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PromptResourceResolver } from '../prompt-resource-resolver.js';

describe('Prompt resource integration', () => {
  it('resolves smartConfig and diagnosis from the same active version root', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-prompt-int-'));
    const versionRoot = path.join(tmpRoot, 'hagicode-1');
    const smartPrompt = path.join(versionRoot, 'config', 'config-prompt.llm.txt');
    const diagnosisPrompt = path.join(versionRoot, 'scripts', 'diagnosis-prompt.llm.txt');

    await fs.mkdir(path.dirname(smartPrompt), { recursive: true });
    await fs.mkdir(path.dirname(diagnosisPrompt), { recursive: true });
    await fs.writeFile(smartPrompt, 'smart config prompt');
    await fs.writeFile(diagnosisPrompt, 'diagnosis prompt');

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
    const diagnosisResult = await resolver.resolve({
      resourceKey: 'diagnosis',
      runtime,
      activeVersion,
    });

    assert.equal(smartResult.success, true);
    assert.equal(diagnosisResult.success, true);
    if (smartResult.success && diagnosisResult.success) {
      assert.equal(smartResult.source, 'active-version');
      assert.equal(diagnosisResult.source, 'active-version');
      assert.equal(smartResult.resolvedPath, path.normalize(smartPrompt));
      assert.equal(diagnosisResult.resolvedPath, path.normalize(diagnosisPrompt));
    }
  });
});

