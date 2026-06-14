import assert from 'node:assert/strict';
import test from 'node:test';

const { resolveUpdatedMsixArtifacts } = await import(new URL('../build-store-package.js', import.meta.url));

test('treats a rebuilt msix at the same path as a new artifact when metadata changes', () => {
  const artifactPath = 'C:\\tmp\\Hagicode Desktop.msix';
  const updatedArtifacts = resolveUpdatedMsixArtifacts(
    [{ path: artifactPath, signature: '1024:100:100' }],
    [{ path: artifactPath, signature: '1024:200:300' }],
  );

  assert.deepEqual(updatedArtifacts, [artifactPath]);
});

test('ignores unchanged msix artifacts when their path and metadata match', () => {
  const artifactPath = 'C:\\tmp\\Hagicode Desktop.msix';
  const updatedArtifacts = resolveUpdatedMsixArtifacts(
    [{ path: artifactPath, signature: '1024:100:100' }],
    [{ path: artifactPath, signature: '1024:100:100' }],
  );

  assert.deepEqual(updatedArtifacts, []);
});
