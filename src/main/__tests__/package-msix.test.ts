import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { normalizeWindowsVersion } from '../../../scripts/msix-config.js';
import { renderMsixManifest } from '../../../scripts/prepare-msix.js';
import {
  renderStoreForgeConfigOverlay,
  validateServerPayloadRoot,
  validateStorePackageConfig,
} from '../../../scripts/store-package-config.js';

describe('msix packaging helpers', () => {
  it('normalizes semver into Windows package version format', () => {
    assert.equal(normalizeWindowsVersion('1.2.3'), '1.2.3.0');
    assert.equal(normalizeWindowsVersion('1.2.3-beta.4'), '1.2.3.4');
    assert.equal(normalizeWindowsVersion('1.2.3-rc.12'), '1.2.3.12');
  });

  it('renders a full-trust MSIX manifest with desktop assets and capabilities', async () => {
    const templatePath = path.resolve(process.cwd(), 'resources', 'msix', 'Package.appxmanifest.template.xml');
    const template = await readFile(templatePath, 'utf8');
    const manifest = renderMsixManifest(template, {
      packageIdentity: 'newbe36524.HagicodeDesktop',
      publisher: 'CN=8B6C8A94-AAE5-4C8B-9202-A29EA42B042F',
      packageVersion: '0.1.0.0',
      processorArchitecture: 'x64',
      packageDisplayName: 'Hagicode Desktop',
      publisherDisplayName: 'newbe36524',
      packageDescription: 'Desktop client for Hagicode Server management and monitoring',
      appExecutable: 'Hagicode Desktop.exe',
      appDisplayName: 'Hagicode Desktop',
      packageBackgroundColor: 'transparent',
      packageMinOsVersion: '10.0.19041.0',
      packageMaxOsVersionTested: '10.0.19041.0',
      languages: ['en-US', 'zh-CN'],
      capabilities: ['internetClient', 'privateNetworkClientServer', 'runFullTrust'],
    });

    assert.match(manifest, /Windows\.FullTrustApplication/);
    assert.match(manifest, /assets\\StoreLogo\.png/);
    assert.match(manifest, /assets\\Wide310x150Logo\.png/);
    assert.match(manifest, /<Capability Name="internetClient" \/>/);
    assert.match(manifest, /<Capability Name="privateNetworkClientServer" \/>/);
    assert.match(manifest, /<rescap:Capability Name="runFullTrust" \/>/);
  });

  it('validates the desktop-owned Store config schema', () => {
    const config = validateStorePackageConfig({
      schemaVersion: 1,
      sourceForgeConfigPath: 'forge.config.js',
      inputDirectory: 'pkg/win-unpacked',
      outputDirectory: 'pkg',
      stageDirectory: 'build/msix-stage',
      assetsDirectory: 'resources/msix',
      metadataOutputPath: 'pkg/store-build-metadata.json',
      runtimeInjectionPath: 'resources/portable-fixed/current',
      packageIdentity: {
        displayName: 'Hagicode',
        publisherDisplayName: 'newbe36524',
        publisher: 'CN=8B6C8A94-AAE5-4C8B-9202-A29EA42B042F',
        identityName: 'newbe36524.Hagicode',
        backgroundColor: 'transparent',
        languages: ['en-US', 'zh-CN'],
        addAutoLaunchExtension: false,
      },
      msix: {
        minVersion: '10.0.17763.0',
        maxVersionTested: '10.0.19045.0',
        capabilities: ['runFullTrust', 'internetClient'],
      },
    });

    assert.equal(config.packageIdentity.identityName, 'newbe36524.Hagicode');
    assert.equal(config.runtimeInjectionPath, 'resources/portable-fixed/current');
    assert.deepEqual(config.msix.capabilities, ['runFullTrust', 'internetClient']);
  });

  it('renders the Store overlay from the desktop-owned Store config', () => {
    const overlay = JSON.parse(renderStoreForgeConfigOverlay({
      sourceConfigPath: 'forge.config.js',
      buildVersion: '0.1.0.0',
      storeConfig: {
        packageIdentity: {
          displayName: 'Hagicode',
          publisherDisplayName: 'newbe36524',
          publisher: 'CN=8B6C8A94-AAE5-4C8B-9202-A29EA42B042F',
          identityName: 'newbe36524.Hagicode',
          backgroundColor: 'transparent',
          languages: ['en-US', 'zh-CN'],
          addAutoLaunchExtension: false,
        },
        msix: {
          minVersion: '10.0.17763.0',
          maxVersionTested: '10.0.19045.0',
          capabilities: ['runFullTrust', 'internetClient', 'privateNetworkClientServer'],
        },
      },
    }));

    assert.equal(overlay.extends, 'forge.config.js');
    assert.equal(overlay.buildVersion, '0.1.0.0');
    assert.equal(overlay.packageIdentity.identityName, 'newbe36524.Hagicode');
    assert.deepEqual(overlay.msix.capabilities, ['runFullTrust', 'internetClient', 'privateNetworkClientServer']);
  });

  it('rejects incomplete payload roots before packaging begins', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'desktop-store-payload-'));
    await mkdir(path.join(runtimeRoot, 'lib'), { recursive: true });
    await writeFile(path.join(runtimeRoot, 'manifest.json'), '{}');
    await writeFile(path.join(runtimeRoot, 'lib', 'PCode.Web.dll'), 'fixture');

    await assert.rejects(
      () => validateServerPayloadRoot(runtimeRoot, 'win-x64'),
      /Missing:/,
    );
  });
});
