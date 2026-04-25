import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PromptResourceResolver } from '../prompt-resource-resolver.js';
import { PromptGuidanceService } from '../prompt-guidance-service.js';

describe('PromptGuidanceService', () => {
  it('returns prompt content, fallback metadata, and static tool context', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-guidance-'));
    const fallbackPromptPath = path.join(tmpRoot, 'config', 'config-prompt.llm.txt');
    await fs.mkdir(path.dirname(fallbackPromptPath), { recursive: true });
    await fs.writeFile(fallbackPromptPath, 'smart config prompt from development root');

    const service = new PromptGuidanceService({
      promptResourceResolver: new PromptResourceResolver(),
    });

    const result = await service.buildResourceGuidance({
      entryPoint: 'smartConfig',
      resourceKey: 'smartConfig',
      activeVersion: {
        id: 'hagicode-missing',
        installedPath: path.join(tmpRoot, 'missing-version'),
      },
      runtime: {
        isPackaged: false,
        appPath: '/app-root',
        cwd: tmpRoot,
      },
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.promptContent, 'smart config prompt from development root');
      assert.equal(result.promptSource, 'development-root');
      assert.equal(result.suggestedWorkingDirectory, path.join(tmpRoot, 'missing-version'));
      assert.ok(result.attemptedPaths.some((candidate) => candidate.endsWith(path.join('config', 'config-prompt.llm.txt'))));
      assert.deepEqual(result.supportedTools.map((tool) => tool.cliType), [
        'claude-code',
        'codex',
        'copilot',
        'opencode',
        'qoder',
        'kiro-cli',
        'kimi',
        'gemini',
        'deepagents',
        'codebuddy',
        'hermes',
      ]);
    }
  });

  it('returns structured failure diagnostics when prompt resolution fails', async () => {
    const service = new PromptGuidanceService({
      promptResourceResolver: new PromptResourceResolver(async () => false),
    });

    const result = await service.buildResourceGuidance({
      entryPoint: 'smartConfig',
      resourceKey: 'smartConfig',
      runtime: {
        isPackaged: false,
        appPath: '/app-root',
        cwd: '/workspace',
      },
      activeVersion: null,
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.errorCode, 'PROMPT_NOT_FOUND');
      assert.ok(result.attemptedPaths.length > 0);
    }
  });

  it('builds version prompt guidance from the manifest prompt loader', async () => {
    const service = new PromptGuidanceService({
      llmInstallationManager: {
        loadPrompt: async () => ({
          version: '1.0.0',
          content: 'install dependencies',
          region: 'CN',
          filePath: '/versions/hagicode-1/config/install.llm.txt',
          detection: {
            region: 'CN',
            detectedAt: new Date(),
            method: 'override',
            localeSnapshot: null,
            rawLocale: null,
            matchedRule: 'manual-override',
          },
        }),
      } as any,
      resolveManifestPath: (versionId) => `/versions/${versionId}/manifest.json`,
    });

    const result = await service.buildVersionGuidance({
      versionId: 'hagicode-1',
      region: 'cn',
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.promptSource, 'manifest-entry');
      assert.equal(result.promptPath, '/versions/hagicode-1/config/install.llm.txt');
      assert.equal(result.suggestedWorkingDirectory, '/versions/hagicode-1');
      assert.deepEqual(result.attemptedPaths, [
        '/versions/hagicode-1/manifest.json',
        '/versions/hagicode-1/config/install.llm.txt',
      ]);
    }
  });
});
