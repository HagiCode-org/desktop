import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type Store from 'electron-store';
import {
  includesAuthRequiredHint,
  includesInvalidArgumentHint,
  LlmInstallationManager,
} from '../llm-installation-manager.js';
import { RegionDetector } from '../region-detector.js';

describe('llm-installation-manager hint parsing', () => {
  it('detects auth-required hints from copilot output', () => {
    assert.equal(includesAuthRequiredHint('authentication required: please sign in first'), true);
    assert.equal(includesAuthRequiredHint('Not logged in. Run copilot auth login'), true);
    assert.equal(includesAuthRequiredHint('all good'), false);
  });

  it('detects invalid-argument hints from CLI output', () => {
    assert.equal(includesInvalidArgumentHint('unknown option --foo'), true);
    assert.equal(includesInvalidArgumentHint('Invalid argument: --bar'), true);
    assert.equal(includesInvalidArgumentHint('execution started successfully'), false);
  });
});

class MemoryStore {
  private readonly data = new Map<string, unknown>();

  get(key: string) {
    return this.data.get(key);
  }

  set(key: string, value: unknown) {
    this.data.set(key, value);
  }

  delete(key: string) {
    this.data.delete(key);
  }
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function createManifestFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-llm-prompt-'));
  const scriptsDir = path.join(tempDir, 'scripts');
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.writeFile(path.join(scriptsDir, 'cn.llm.txt'), 'cn prompt');
  await fs.writeFile(path.join(scriptsDir, 'intl.llm.txt'), 'intl prompt');
  await fs.writeFile(
    path.join(tempDir, 'manifest.json'),
    JSON.stringify({
      package: { version: '1.2.3' },
      entryPoint: {
        llmPrompt: 'scripts/cn.llm.txt',
        llmPromptIntl: 'scripts/intl.llm.txt',
      },
    }),
  );

  return {
    tempDir,
    manifestPath: path.join(tempDir, 'manifest.json'),
  };
}


describe('llm-installation-manager prompt selection', () => {
  it('selects Chinese prompt files for Chinese locale variants and international prompt files otherwise', async () => {
    const store = new MemoryStore();
    let locale = 'zh-Hans-CN';
    const detector = new RegionDetector(store as unknown as Store<Record<string, unknown>>, {
      getLocale: () => locale,
      logger: silentLogger,
    });
    const manager = new LlmInstallationManager(detector);
    const fixture = await createManifestFixture();

    try {
      const chinesePrompt = await manager.loadPrompt(fixture.manifestPath);
      assert.equal(chinesePrompt.region, 'CN');
      assert.equal(chinesePrompt.content, 'cn prompt');
      assert.match(chinesePrompt.filePath, /cn\.llm\.txt$/);

      locale = 'en-US';
      const internationalPrompt = await manager.loadPrompt(fixture.manifestPath);
      assert.equal(internationalPrompt.region, 'INTERNATIONAL');
      assert.equal(internationalPrompt.content, 'intl prompt');
      assert.match(internationalPrompt.filePath, /intl\.llm\.txt$/);
    } finally {
      await fs.rm(fixture.tempDir, { recursive: true, force: true });
    }
  });

  it('keeps manual region override precedence over automatic locale detection', async () => {
    let localeReadCount = 0;
    const detector = new RegionDetector(new MemoryStore() as unknown as Store<Record<string, unknown>>, {
      getLocale: () => {
        localeReadCount += 1;
        return 'zh-CN';
      },
      logger: silentLogger,
    });
    const manager = new LlmInstallationManager(detector);
    const fixture = await createManifestFixture();

    try {
      const prompt = await manager.loadPrompt(fixture.manifestPath, 'international');
      assert.equal(prompt.region, 'INTERNATIONAL');
      assert.equal(prompt.content, 'intl prompt');
      assert.equal(prompt.detection.method, 'override');
      assert.equal(prompt.detection.matchedRule, 'manual-override');
      assert.equal(localeReadCount, 0);
    } finally {
      await fs.rm(fixture.tempDir, { recursive: true, force: true });
    }
  });

  it('uses the latest explicit region override when users switch regions between retries', async () => {
    const detector = new RegionDetector(new MemoryStore() as unknown as Store<Record<string, unknown>>, {
      getLocale: () => 'zh-CN',
      logger: silentLogger,
    });
    const manager = new LlmInstallationManager(detector);
    const fixture = await createManifestFixture();

    try {
      const firstPrompt = await manager.loadPrompt(fixture.manifestPath, 'cn');
      assert.equal(firstPrompt.region, 'CN');
      assert.equal(firstPrompt.content, 'cn prompt');
      assert.equal(firstPrompt.detection.method, 'override');

      const retriedPrompt = await manager.loadPrompt(fixture.manifestPath, 'international');
      assert.equal(retriedPrompt.region, 'INTERNATIONAL');
      assert.equal(retriedPrompt.content, 'intl prompt');
      assert.equal(retriedPrompt.detection.method, 'override');
      assert.equal(retriedPrompt.detection.matchedRule, 'manual-override');
    } finally {
      await fs.rm(fixture.tempDir, { recursive: true, force: true });
    }
  });
});
