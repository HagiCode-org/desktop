import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderMsixManifest, resolveProducedMsixFileName, toWindowsPackageVersion } from '../../../scripts/package-msix.js';

describe('package-msix helpers', () => {
  it('converts semver into Windows package version format', () => {
    assert.equal(toWindowsPackageVersion('1.2.3'), '1.2.3.0');
    assert.equal(toWindowsPackageVersion('1.2.3-beta.4'), '1.2.3.4');
    assert.equal(toWindowsPackageVersion('1.2.3-rc.12'), '1.2.3.12');
  });

  it('resolves winapp output names that append package metadata', () => {
    assert.equal(
      resolveProducedMsixFileName({
        desiredFileName: 'Hagicode-Desktop-0.1.58-x64.msix',
        packageVersion: '0.1.58.0',
        arch: 'x64',
        fileNames: ['Hagicode-Desktop-0.1.58-x64.msix_0.1.58.0_x64.msix'],
      }),
      'Hagicode-Desktop-0.1.58-x64.msix_0.1.58.0_x64.msix',
    );

    assert.equal(
      resolveProducedMsixFileName({
        desiredFileName: 'Hagicode-Desktop-0.1.58-x64.msix',
        packageVersion: '0.1.58.0',
        arch: 'x64',
        fileNames: ['Hagicode-Desktop-0.1.58-x64_0.1.58.0_x64.msix'],
      }),
      'Hagicode-Desktop-0.1.58-x64_0.1.58.0_x64.msix',
    );
  });

  it('renders a full-trust MSIX manifest with desktop assets and capabilities', () => {
    const manifest = renderMsixManifest({
      identityName: 'newbe36524.HagicodeDesktop',
      publisher: 'CN=8B6C8A94-AAE5-4C8B-9202-A29EA42B042F',
      version: '0.1.0.0',
      arch: 'x64',
      displayName: 'Hagicode Desktop',
      publisherDisplayName: 'newbe36524',
      description: 'Desktop client for Hagicode Server management and monitoring',
      executable: 'Hagicode Desktop.exe',
      applicationId: 'newbe36524.HagicodeDesktop',
      backgroundColor: 'transparent',
      languages: ['en-US', 'zh-CN'],
      capabilities: ['internetClient', 'privateNetworkClientServer', 'runFullTrust'],
      minVersion: '10.0.19041.0',
      maxVersionTested: '10.0.19041.0',
    });

    assert.match(manifest, /Windows\.FullTrustApplication/);
    assert.match(manifest, /Assets\\StoreLogo\.png/);
    assert.match(manifest, /Assets\\Wide310x150Logo\.png/);
    assert.match(manifest, /<Capability Name="internetClient" \/>/);
    assert.match(manifest, /<Capability Name="privateNetworkClientServer" \/>/);
    assert.match(manifest, /<rescap:Capability Name="runFullTrust" \/>/);
  });
});
