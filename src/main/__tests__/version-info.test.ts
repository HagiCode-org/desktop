import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILD_BRANCH, BUILD_COMMIT } from '../generated/build-metadata.js';
import { createDesktopVersionInfoPayload } from '../version-info.js';

describe('desktop version-info payload', () => {
  it('includes the build branch and the full build commit from the generated module', () => {
    const payload = createDesktopVersionInfoPayload('0.1.0', null);

    assert.equal(payload.buildBranch, BUILD_BRANCH);
    assert.equal(payload.buildCommit, BUILD_COMMIT);
  });

  it('keeps desktopVersion and windowsStoreVersion with their existing meaning', () => {
    const payload = createDesktopVersionInfoPayload('0.1.0', '1.2.3.0');

    assert.equal(payload.desktopVersion, '0.1.0');
    assert.equal(payload.windowsStoreVersion, '1.2.3.0');
    assert.equal(createDesktopVersionInfoPayload('0.1.0', null).windowsStoreVersion, null);
  });

  it('returns placeholder build fields as plain strings, never null', () => {
    const payload = createDesktopVersionInfoPayload('0.1.0', null);

    assert.equal(typeof payload.buildBranch, 'string');
    assert.equal(typeof payload.buildCommit, 'string');
    assert.ok(payload.buildBranch.length > 0);
    assert.ok(payload.buildCommit.length > 0);
  });
});
