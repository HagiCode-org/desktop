import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArtifactNames, selectArtifact } from '../download-workflow-artifact.mjs';

test('parseArtifactNames trims, splits, and deduplicates fallback names', () => {
  assert.deepEqual(
    parseArtifactNames(' release-linux-tar-gz-assets, hagicode-linux-tar-gz-sha ,release-linux-tar-gz-assets '),
    ['release-linux-tar-gz-assets', 'hagicode-linux-tar-gz-sha'],
  );
});

test('selectArtifact prefers the first available fallback artifact', () => {
  const artifacts = [
    { name: 'hagicode-linux-tar-gz-sha' },
    { name: 'release-linux-tar-gz-assets' },
  ];

  assert.deepEqual(
    selectArtifact(artifacts, ['release-linux-tar-gz-assets', 'hagicode-linux-tar-gz-sha']),
    { name: 'release-linux-tar-gz-assets' },
  );
});

test('selectArtifact returns null when no fallback artifact exists', () => {
  assert.equal(selectArtifact([{ name: 'other-artifact' }], ['missing-a', 'missing-b']), null);
});
