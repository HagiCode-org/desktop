import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  loadDistributionMetadata,
  normalizeDistributionMetadata,
} from '../distribution/distribution-metadata-loader.js';
import { resolveDistributionModeState } from '../../types/distribution-mode.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('distribution metadata loader', () => {
  it('loads packaged metadata and derives Steam fusion state while preserving sub-channel flags', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-distribution-metadata-'));
    const resourcesRoot = path.join(tempRoot, 'resources');
    tempDirectories.push(tempRoot);
    await fs.mkdir(resourcesRoot, { recursive: true });
    await fs.writeFile(path.join(resourcesRoot, 'distribution-metadata.json'), JSON.stringify({
      schemaVersion: 1,
      channel: 'steam',
      extensions: {
        packaging: 'desktop',
      },
    }), 'utf8');

    const result = await loadDistributionMetadata({
      cwd: tempRoot,
      moduleDirectory: tempRoot,
      resourcesPath: resourcesRoot,
    });
    const state = resolveDistributionModeState({
      metadata: result.metadata,
      hasBundledRuntime: true,
      isWindowsStoreRuntime: false,
    });

    assert.equal(result.error, null);
    assert.equal(result.metadata?.channel, 'steam');
    assert.equal(result.metadata?.mode, 'fusion');
    assert.equal(state.fusionMode, true);
    assert.equal(state.steamMode, true);
    assert.equal(state.winStoreMode, false);
    assert.equal(state.mode, 'steam');
  });

  it('derives Windows Store fusion state without losing the store-only sub-channel', () => {
    const metadata = normalizeDistributionMetadata({
      schemaVersion: 1,
      channel: 'win-store',
    });
    const state = resolveDistributionModeState({
      metadata,
      hasBundledRuntime: true,
      isWindowsStoreRuntime: true,
    });

    assert.equal(state.fusionMode, true);
    assert.equal(state.steamMode, false);
    assert.equal(state.winStoreMode, true);
    assert.equal(state.mode, 'win-store');
  });

  it('falls back safely when metadata is missing or incomplete', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-distribution-metadata-missing-'));
    const resourcesRoot = path.join(tempRoot, 'resources');
    tempDirectories.push(tempRoot);
    await fs.mkdir(resourcesRoot, { recursive: true });

    const missingResult = await loadDistributionMetadata({
      cwd: tempRoot,
      moduleDirectory: tempRoot,
      resourcesPath: resourcesRoot,
    });
    const incompleteMetadata = normalizeDistributionMetadata({
      schemaVersion: 1,
      mode: 'fusion',
    });
    const incompleteState = resolveDistributionModeState({
      metadata: incompleteMetadata,
      hasBundledRuntime: false,
      isWindowsStoreRuntime: false,
    });

    assert.equal(missingResult.metadata, null);
    assert.equal(missingResult.error, null);
    assert.equal(incompleteState.fusionMode, false);
    assert.equal(incompleteState.steamMode, false);
    assert.equal(incompleteState.winStoreMode, false);
    assert.equal(incompleteState.mode, 'normal');
  });
});
