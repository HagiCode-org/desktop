import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const runtimeManifestPath = path.resolve(process.cwd(), 'resources/embedded-runtime/runtime-manifest.json');
const smokeTestPath = path.resolve(process.cwd(), 'scripts/smoke-test.js');
const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const electronBuilderPath = path.resolve(process.cwd(), 'electron-builder.yml');
const developmentDocPath = path.resolve(process.cwd(), 'docs/development.md');
const releaseReadmePath = path.resolve(process.cwd(), '..', 'hagicode-release', 'README.md');

describe('embedded runtime packaging configuration', () => {
  it('declares pinned macOS runtime targets in the manifest', async () => {
    const manifest = JSON.parse(await fs.readFile(runtimeManifestPath, 'utf-8'));

    assert.equal(manifest.platforms['osx-x64']?.rid, 'osx-x64');
    assert.equal(manifest.platforms['osx-arm64']?.rid, 'osx-arm64');
    assert.match(manifest.platforms['osx-x64']?.downloadUrl || '', /aspnetcore-runtime-10\.0\.5-osx-x64\.tar\.gz$/);
    assert.match(manifest.platforms['osx-arm64']?.downloadUrl || '', /aspnetcore-runtime-10\.0\.5-osx-arm64\.tar\.gz$/);
  });

  it('smoke test inspects packaged macOS app resources outside app.asar', async () => {
    const source = await fs.readFile(smokeTestPath, 'utf-8');

    assert.match(source, /Contents', 'Resources', 'dotnet'/);
    assert.match(source, /mac-arm64/);
    assert.match(source, /mac-x64/);
    assert.match(source, /not executable/);
  });

  it('package scripts provide targeted macOS runtime smoke validation for both architectures', async () => {
    const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    assert.match(pkg.scripts['build:mac:x64'] || '', /package:smoke-test:mac:x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /package:smoke-test:mac:arm64/);
    assert.match(pkg.scripts['package:smoke-test:mac:x64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:smoke-test:mac:arm64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-arm64/);
  });

  it('ships the optional portable fixed payload through the dedicated extra directory contract', async () => {
    const builder = await fs.readFile(electronBuilderPath, 'utf-8');
    const docs = await fs.readFile(developmentDocPath, 'utf-8');
    const releaseReadme = await fs.readFile(releaseReadmePath, 'utf-8');

    assert.match(builder, /from: resources\/portable-fixed/);
    assert.match(builder, /to: extra\/portable-fixed/);
    assert.match(docs, /resources\/portable-fixed\/current/);
    assert.match(docs, /extra\/portable-fixed\/current/);
    assert.match(docs, /bundled Node environment/i);
    assert.match(docs, /Steam Linux startup compatibility/i);
    assert.match(docs, /Direct CLI startup already works/i);
    assert.match(releaseReadme, /Steam Linux desktop artifact verification/i);
    assert.match(releaseReadme, /direct CLI launch keeps the default graphics path/i);
  });
});
