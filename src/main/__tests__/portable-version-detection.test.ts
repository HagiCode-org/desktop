import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pathManagerPath = path.resolve(process.cwd(), 'src/main/path-manager.ts');
const metadataLoaderPath = path.resolve(process.cwd(), 'src/main/distribution/distribution-metadata-loader.ts');
const versionManagerPath = path.resolve(process.cwd(), 'src/main/version-manager.ts');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('portable version payload detection', () => {
  it('defines the packaged extra payload contract and required runtime files', async () => {
    const source = await fs.readFile(pathManagerPath, 'utf-8');

    assert.match(source, /portable-fixed/);
    assert.match(source, /PCode\.Web\.dll/);
    assert.match(source, /PCode\.Web\.runtimeconfig\.json/);
    assert.match(source, /PCode\.Web\.deps\.json/);
    assert.match(source, /validatePortableRuntimePayload/);
    assert.match(source, /getPortableRuntimeSelection/);
    assert.match(source, /resolvePackagedPortableRuntimeSelection/);
    assert.match(source, /resolvePackagedPortableToolchainRoot/);
    assert.match(source, /compatibility-flat-extra-root/);
  });

  it('switches into steam mode only when the packaged payload validates and otherwise falls back safely', async () => {
    const [loaderSource, source] = await Promise.all([
      fs.readFile(metadataLoaderPath, 'utf-8'),
      fs.readFile(versionManagerPath, 'utf-8'),
    ]);

    assert.match(loaderSource, /distribution-metadata\.json/);
    assert.match(loaderSource, /loadDistributionMetadata/);
    assert.match(loaderSource, /normalizeDistributionMetadata/);
    assert.match(source, /initializeDistributionMode/);
    assert.match(source, /const isWindowsStorePackage = isWindowsStoreRuntime\(\{/);
    assert.match(source, /const metadataResult = await loadDistributionMetadata\(\{/);
    assert.match(source, /processWindowsStore: Boolean\(runtimeProcess\.windowsStore\)/);
    assert.match(source, /defaultApp: runtimeProcess\.defaultApp/);
    assert.match(source, /Windows Store runtime detected, checking packaged portable-fixed payload/);
    assert.match(source, /Loaded distribution metadata from resources/);
    assert.match(source, /Distribution metadata not found, falling back to runtime detection/);
    assert.match(source, /Portable version payload not found, using normal mode/);
    assert.match(source, /Portable version bundle member not found, falling back to normal mode/);
    assert.match(source, /Portable version payload validation failed, falling back to normal mode/);
    assert.match(source, /Portable version payload detected successfully/);
    assert.match(source, /resolveDistributionModeState\(\{/);
    assert.match(source, /fusionMode: this\.distributionState\.fusionMode/);
    assert.match(source, /steamMode: this\.distributionState\.steamMode/);
    assert.match(source, /winStoreMode: this\.distributionState\.winStoreMode/);
    assert.doesNotMatch(source, /Windows Store\/MSIX package detected, using normal distribution mode/);
    assert.match(source, /selectedPlatform/);
    assert.match(source, /bundleRoot/);
    assert.match(source, /manifestPath/);
    assert.match(source, /getDistributionModeState\(\): DistributionModeState/);
  });

  it('exposes distribution mode to the renderer and initializes the active runtime during startup', async () => {
    const source = await fs.readFile(mainPath, 'utf-8');

    assert.match(source, /get-distribution-mode/);
    assert.match(source, /get-distribution-mode-state/);
    assert.match(source, /function getDistributionModeState\(\): DistributionModeState/);
    assert.match(source, /initializeDistributionMode\(\)/);
    assert.match(source, /applyActiveRuntimeToWebServiceManager/);
    assert.match(source, /webServiceManager\.setActiveRuntime\(distributionModeState\.activeRuntime\)/);
    assert.match(source, /setActiveRuntime\(runtimeDescriptor\)/);
    assert.doesNotMatch(source, /portablePayloadDetectedDuringStartup/);
  });
});
