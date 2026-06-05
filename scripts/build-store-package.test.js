#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStepScripts,
  createStoreBuildMetadata,
  resolveStoreRuntimePolicyEnvironment,
} from './build-store-package.js';
import { toWindowsPackageVersion } from './store-package-config.js';

test('buildStepScripts prefers optional runtime preparation entrypoints for Store builds', () => {
  const scripts = {
    'prepare:runtime': 'node scripts/prepare-embedded-runtime.js',
    'prepare:runtime:optional': 'node scripts/prepare-runtime-if-supported.js',
    'prepare:bundled-toolchain': 'node scripts/prepare-bundled-toolchain.js',
    'prepare:bundled-toolchain:optional': 'node scripts/prepare-bundled-toolchain-if-supported.js',
    'build:prod': 'npm run build:all',
  };

  assert.deepEqual(buildStepScripts(scripts), [
    'prepare:runtime:optional',
    'prepare:bundled-toolchain:optional',
    'build:prod',
  ]);
});

test('resolveStoreRuntimePolicyEnvironment defaults Store builds to internal dependency management', () => {
  assert.deepEqual(resolveStoreRuntimePolicyEnvironment({}), {
    HAGICODE_RUNTIME_CONSUMER: 'windows-store',
    HAGICODE_RUNTIME_DEPENDENCY_MANAGEMENT_MODE: 'internal',
  });
});

test('toWindowsPackageVersion accepts tagged Windows Store versions from win_store_packer', () => {
  assert.equal(toWindowsPackageVersion('v0.2.1'), '0.2.1.0');
  assert.equal(toWindowsPackageVersion('V0.2.1-beta.7'), '0.2.1.7');
});

test('createStoreBuildMetadata records Node preparation as internal by default for Store builds', () => {
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
    nodePreparation: {
      status: 'not-run-dry-run',
      reason: null,
      consumer: 'windows-store',
      dependencyManagementMode: 'internal',
    },
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

  assert.deepEqual(metadata.nodePreparation, {
    status: 'not-run-dry-run',
    reason: null,
    consumer: 'windows-store',
    dependencyManagementMode: 'internal',
  });
  assert.equal(metadata.windowsStoreVersion, 'v0.1.0');
});
