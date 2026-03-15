import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDesktopCompatibility } from '../desktop-compatibility.js';
import type { Manifest } from '../manifest-reader.js';

function buildManifest(desktopCompatibility?: { minVersion: string; message?: string }): Manifest {
  return {
    $schema: 'https://schema.hagicode.com/schemas/manifest/v1.schema.json',
    manifestVersion: '1.0',
    package: {
      name: 'hagicode',
      version: '0.0.0-test',
      buildTimestamp: '2026-03-15T00:00:00.000Z',
      gitCommit: 'test',
    },
    dependencies: {},
    filesReference: {
      path: '0.0.0-test.files.json',
      checksum: 'sha256:test',
      format: 'json',
      count: 0,
    },
    metadata: {
      description: 'test',
      author: 'test',
      license: 'AGPL-3.0',
      homepage: 'https://example.com',
      documentation: 'https://example.com/docs',
      repository: 'https://example.com/repo',
    },
    ...(desktopCompatibility ? { desktopCompatibility } : {}),
  } as Manifest;
}

describe('desktop package compatibility', () => {
  it('treats manifests without desktopCompatibility metadata as compatible', () => {
    const result = evaluateDesktopCompatibility(buildManifest(), '1.4.3');

    assert.equal(result.declared, false);
    assert.equal(result.compatible, true);
    assert.equal(result.requiredVersion, undefined);
    assert.equal(result.currentVersion, '1.4.3');
  });

  it('marks manifests requiring a newer Desktop version as incompatible', () => {
    const result = evaluateDesktopCompatibility(
      buildManifest({
        minVersion: '1.6.0',
        message: 'Package requires Desktop host features not present yet.',
      }),
      '1.4.3',
    );

    assert.equal(result.declared, true);
    assert.equal(result.compatible, false);
    assert.equal(result.requiredVersion, '1.6.0');
    assert.equal(result.currentVersion, '1.4.3');
    assert.match(result.reason || '', /Package requires Hagicode Desktop >= 1.6.0/);
    assert.match(result.reason || '', /Current Desktop version is 1.4.3/);
    assert.match(result.reason || '', /Upgrade Desktop before retrying/);
  });

  it('accepts manifests whose minimum Desktop version is met', () => {
    const result = evaluateDesktopCompatibility(
      buildManifest({
        minVersion: '1.6.0',
      }),
      '1.6.1',
    );

    assert.equal(result.declared, true);
    assert.equal(result.compatible, true);
    assert.equal(result.requiredVersion, '1.6.0');
    assert.equal(result.currentVersion, '1.6.1');
    assert.equal(result.reason, undefined);
  });
});
