#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStepScripts,
  createStoreBuildMetadata,
  resolveStoreRuntimePolicyEnvironment,
  validateStoreMsixRuntimeEntries,
} from './build-store-package.js';
import { toWindowsPackageVersion } from './store-package-config.js';

test('Store builds prepare only the .NET runtime before production assets', () => {
  const scripts = {
    'prepare:runtime': 'node scripts/prepare-embedded-runtime.js',
    'build:prod': 'npm run build:all',
    'prepare:bundled-toolchain': 'node scripts/prepare-bundled-toolchain.js',
  };

  assert.deepEqual(buildStepScripts(scripts), [
    'prepare:runtime',
    'build:prod',
  ]);
  assert.throws(() => buildStepScripts({ 'build:prod': scripts['build:prod'] }), /prepare:runtime/);
});

test('Store MSIX requires the pinned .NET runtime and excludes Node', () => {
  const target = { hostFxrVersion: '10.0.10', netCoreVersion: '10.0.10', aspNetCoreVersion: '10.0.10' };
  const prefix = 'VFS/ProgramFilesX64/Hagicode Desktop/resources/extra/runtime/components/dotnet/runtime/win-x64/current/';
  const entries = [
    `${prefix}dotnet.exe`,
    `${prefix}host/fxr/10.0.10/hostfxr.dll`,
    `${prefix}shared/Microsoft.NETCore.App/10.0.10/System.Private.CoreLib.dll`,
    `${prefix}shared/Microsoft.AspNetCore.App/10.0.10/Microsoft.AspNetCore.dll`,
  ];
  assert.doesNotThrow(() => validateStoreMsixRuntimeEntries(entries, 'win-x64', target));
  assert.throws(() => validateStoreMsixRuntimeEntries(entries.slice(1), 'win-x64', target), /dotnet.exe/);
  assert.throws(() => validateStoreMsixRuntimeEntries(entries.map((entry) => entry.replace('10.0.10', '9.0.0')), 'win-x64', target), /runtime/);
  assert.throws(() => validateStoreMsixRuntimeEntries([
    ...entries,
    'VFS/ProgramFilesX64/Hagicode Desktop/resources/extra/runtime/components/node/runtime/node.exe',
  ], 'win-x64', target), /Node runtime/);
  assert.throws(() => validateStoreMsixRuntimeEntries([
    ...entries,
    'app/resources/extra/runtime/components/node/runtime/package.json',
  ], 'win-x64', target), /Node runtime/);
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
