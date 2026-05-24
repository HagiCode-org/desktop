import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMsixVerificationConfig } from './write-msix-verification-config.js';

test('renderMsixVerificationConfig produces an appx-only overlay that emits a real msix artifact', () => {
  const output = renderMsixVerificationConfig();

  assert.match(output, /^extends: electron-builder\.yml$/m);
  assert.match(output, /^win:\n  target:\n    - appx$/m);
  assert.match(output, /^appx:\n  artifactName: \$\{productName\} \$\{version\}\.msix$/m);
  assert.doesNotMatch(output, /portable-fixed/);
});

test('renderMsixVerificationConfig preserves a signing publisher override', () => {
  const output = renderMsixVerificationConfig({
    publisherOverride: 'CN=Hagicode, O=HagiCode, C=US',
  });

  assert.match(output, /^  publisher: "CN=Hagicode, O=HagiCode, C=US"$/m);
});
