#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMacArchiveArch,
  selectDiscoveredArchives,
} from './verify-release-archives.js';

test('selectDiscoveredArchives keeps only the implicit x64 mac zip when arm64 zip is also present', () => {
  const entries = [
    'Hagicode Desktop-0.1.0-mac.zip',
    'Hagicode Desktop-0.1.0-arm64-mac.zip',
    'Hagicode Desktop-0.1.0.dmg',
  ];

  assert.deepEqual(
    selectDiscoveredArchives(entries, {
      platform: 'darwin',
      runtimePlatform: 'osx-x64',
      fallbackPlatform: 'osx-x64',
      codeServerPlatform: 'osx-x64',
    }),
    ['Hagicode Desktop-0.1.0-mac.zip'],
  );
});

test('selectDiscoveredArchives keeps only the arm64 mac zip for arm64 validation', () => {
  const entries = [
    'Hagicode Desktop-0.1.0-mac.zip',
    'Hagicode Desktop-0.1.0-arm64-mac.zip',
  ];

  assert.deepEqual(
    selectDiscoveredArchives(entries, {
      platform: 'darwin',
      runtimePlatform: 'osx-arm64',
      fallbackPlatform: 'osx-arm64',
      codeServerPlatform: 'osx-arm64',
    }),
    ['Hagicode Desktop-0.1.0-arm64-mac.zip'],
  );
});

test('resolveMacArchiveArch prefers explicit requested mac runtime platforms', () => {
  assert.equal(resolveMacArchiveArch({ runtimePlatform: 'osx-x64' }), 'x64');
  assert.equal(resolveMacArchiveArch({ runtimePlatform: 'osx-arm64' }), 'arm64');
});
