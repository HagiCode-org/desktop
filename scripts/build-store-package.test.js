#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildStepScripts,
  createStoreBuildMetadata,
  resolveStoreRuntimePolicyEnvironment,
  validateStoreMsixRuntimeEntries,
} from './build-store-package.js';
import { toWindowsPackageVersion } from './store-package-config.js';

test('development startup prepares runtime assets before launching Electron', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts.predev, 'npm run prepare:runtime');
});

test('Store builds prepare runtime assets before production assets, including the PM2-only Node toolchain', () => {
  const scripts = {
    'prepare:runtime': 'node scripts/prepare-embedded-runtime.js',
    'build:prod': 'npm run build:all',
  };

  assert.deepEqual(buildStepScripts(scripts), [
    'prepare:runtime',
    'build:prod',
  ]);
  assert.equal(
    resolveStoreRuntimePolicyEnvironment({ HAGICODE_RUNTIME_CONSUMER: 'windows-store' }).HAGICODE_RUNTIME_CONSUMER,
    'windows-store',
  );
  assert.throws(() => buildStepScripts({ 'build:prod': scripts['build:prod'] }), /prepare:runtime/);
});

test('Store MSIX requires the pinned .NET runtime and bundled PM2 toolchain', () => {
  const target = { hostFxrVersion: '10.0.10', netCoreVersion: '10.0.10', aspNetCoreVersion: '10.0.10' };
  const prefix = 'VFS/ProgramFilesX64/Hagicode Desktop/resources/extra/runtime/components/dotnet/runtime/win-x64/current/';
  const runtimePrefix = 'VFS/ProgramFilesX64/Hagicode Desktop/resources/extra/runtime/';
  const pm2Files = [
    'npm-pm2/node_modules/pm2/bin/pm2',
    'npm-pm2/node_modules/pm2/package.json',
    'npm-pm2/node_modules/@pm2/io/package.json',
  ];
  const entries = [
    `${prefix}dotnet.exe`,
    `${prefix}host/fxr/10.0.10/hostfxr.dll`,
    `${prefix}shared/Microsoft.NETCore.App/10.0.10/System.Private.CoreLib.dll`,
    `${prefix}shared/Microsoft.AspNetCore.App/10.0.10/Microsoft.AspNetCore.dll`,
    `${runtimePrefix}components/node/runtime/node.exe`,
    ...pm2Files.map((file) => `${runtimePrefix}${file}`),
  ];
  assert.doesNotThrow(() => validateStoreMsixRuntimeEntries(entries, 'win-x64', target, pm2Files));
  assert.throws(() => validateStoreMsixRuntimeEntries(entries.slice(1), 'win-x64', target), /dotnet.exe/);
  assert.throws(() => validateStoreMsixRuntimeEntries(entries.map((entry) => entry.replace('10.0.10', '9.0.0')), 'win-x64', target), /runtime/);
  assert.throws(() => validateStoreMsixRuntimeEntries(
    entries.filter((entry) => !entry.endsWith('/node.exe')),
    'win-x64',
    target,
    pm2Files,
  ), /node\.exe/);
  assert.throws(() => validateStoreMsixRuntimeEntries(
    entries.filter((entry) => !entry.endsWith('/node_modules/@pm2/io/package.json')),
    'win-x64',
    target,
    pm2Files,
  ), /@pm2\/io\/package\.json/);
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
    pm2Toolchain: {
      validationPassed: true,
      validationStatus: 'validated-staged-and-packaged',
      nodeExecutable: 'components/node/runtime/node.exe',
      pm2Entrypoint: 'npm-pm2/node_modules/pm2/bin/pm2',
      pm2Version: '7.0.1',
      requiredFiles: ['components/node/runtime/node.exe', 'npm-pm2/node_modules/pm2/bin/pm2'],
    },
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
  assert.equal(metadata.pm2Toolchain.validationPassed, true);
  assert.equal(metadata.pm2Toolchain.pm2Version, '7.0.1');
});
