#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStepScripts,
  createStoreBuildMetadata,
  resolveStoreRuntimePolicyEnvironment,
} from './build-store-package.js';
import { toWindowsPackageVersion } from './store-package-config.js';

test('buildStepScripts keeps Store builds on the production build entrypoint', () => {
  const scripts = {
    'build:prod': 'npm run build:all',
  };

  assert.deepEqual(buildStepScripts(scripts), [
    'build:prod',
  ]);
});

test('resolveStoreRuntimePolicyEnvironment defaults Store builds to external dependency management', () => {
  assert.deepEqual(resolveStoreRuntimePolicyEnvironment({}), {
    HAGICODE_RUNTIME_CONSUMER: 'windows-store',
  });
});

test('toWindowsPackageVersion accepts tagged Windows Store versions from win_store_packer', () => {
  assert.equal(toWindowsPackageVersion('v0.2.1'), '0.2.1.0');
  assert.equal(toWindowsPackageVersion('V0.2.1-beta.7'), '0.2.1.7');
});

test('createStoreBuildMetadata records external runtime package metadata', () => {
  const metadata = createStoreBuildMetadata({
    artifacts: ['/tmp/Hagicode-Desktop.msix'],
    buildMode: 'desktop-store-build-dry-run',
    desktopSourceRef: 'refs/heads/main',
    desktopVersion: '0.1.0',
    windowsStoreVersion: 'v0.1.0',
    effectiveRuntimeInjectionPath: '/tmp/runtime',
    overlayConfigPath: '/tmp/forge.store-config.json',
    packageVersion: '1.0.0.0',
    payloadValidation: null,
    platformId: 'win-x64',
    restoredWorkspacePayload: false,
    serverPayloadPath: null,
    serverPayloadRoot: null,
    storeConfig: {
      packageIdentity: {
        displayName: 'Hagicode Desktop',
        publisherDisplayName: 'HagiCode',
        publisher: 'CN=HagiCode',
        identityName: 'HagiCode.Desktop',
        languages: ['en-US'],
      },
      msix: {
        capabilities: ['internetClient'],
        minVersion: '10.0.19041.0',
        maxVersionTested: '10.0.26100.0',
      },
    },
    storeConfigPath: '/tmp/store-package.json',
  });

  assert.equal(metadata.windowsStoreVersion, 'v0.1.0');
});
