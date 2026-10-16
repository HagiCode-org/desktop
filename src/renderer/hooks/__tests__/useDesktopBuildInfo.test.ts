import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadDesktopBuildInfo,
  shortBuildCommit,
} from '../useDesktopBuildInfo.js';

const FULL_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

describe('shortBuildCommit', () => {
  it('shortens a full commit hash to its first 7 characters', () => {
    assert.equal(shortBuildCommit(FULL_HASH), 'a1b2c3d');
  });

  it('leaves the unknown placeholder unchanged', () => {
    assert.equal(shortBuildCommit('unknown'), 'unknown');
  });
});

describe('loadDesktopBuildInfo', () => {
  it('resolves to ready with the payload values', async () => {
    const state = await loadDesktopBuildInfo(async () => ({
      desktopVersion: '0.1.0',
      windowsStoreVersion: null,
      buildBranch: 'main',
      buildCommit: FULL_HASH,
    }));

    assert.deepEqual(state, {
      status: 'ready',
      desktopVersion: '0.1.0',
      buildBranch: 'main',
      buildCommit: FULL_HASH,
    });
  });

  it('passes the unknown placeholders through as strings', async () => {
    const state = await loadDesktopBuildInfo(async () => ({
      desktopVersion: '0.1.0',
      windowsStoreVersion: null,
      buildBranch: 'unknown',
      buildCommit: 'unknown',
    }));

    assert.deepEqual(state, {
      status: 'ready',
      desktopVersion: '0.1.0',
      buildBranch: 'unknown',
      buildCommit: 'unknown',
    });
  });

  it('fills missing build fields from an older payload with unknown', async () => {
    const olderPayload = { desktopVersion: '0.1.0', windowsStoreVersion: null };
    const state = await loadDesktopBuildInfo(async () => olderPayload as never);

    assert.deepEqual(state, {
      status: 'ready',
      desktopVersion: '0.1.0',
      buildBranch: 'unknown',
      buildCommit: 'unknown',
    });
  });

  it('resolves to unavailable when the request rejects', async () => {
    const state = await loadDesktopBuildInfo(async () => {
      throw new Error('ipc failed');
    });

    assert.deepEqual(state, { status: 'unavailable' });
  });

  it('resolves to unavailable when the bridge method is missing', async () => {
    assert.deepEqual(await loadDesktopBuildInfo(undefined), { status: 'unavailable' });
    assert.deepEqual(await loadDesktopBuildInfo({}), { status: 'unavailable' });
    assert.deepEqual(await loadDesktopBuildInfo('getVersionInfo'), { status: 'unavailable' });
  });

  it('never reports pending once the request has settled', async () => {
    const state = await loadDesktopBuildInfo(async () => {
      throw new Error('x');
    });
    assert.notEqual(state.status, 'pending');
  });
});
