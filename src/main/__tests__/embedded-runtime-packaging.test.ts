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
const macBuildScriptPath = path.resolve(process.cwd(), 'scripts/build-macos.js');
const bundledToolchainScriptPath = path.resolve(process.cwd(), 'scripts/prepare-bundled-toolchain.js');
const electronBuilderRunnerPath = path.resolve(process.cwd(), 'scripts/run-electron-builder.js');
const macToolchainSigningHookPath = path.resolve(process.cwd(), 'scripts/macos-toolchain-signing-hook.cjs');

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
    const macBuildScript = await fs.readFile(macBuildScriptPath, 'utf-8');

    assert.equal(pkg.scripts['build:mac'], 'node scripts/build-macos.js');
    assert.match(pkg.scripts['build:mac:x64'] || '', /package:smoke-test:mac:x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /package:smoke-test:mac:arm64/);
    assert.match(pkg.scripts['build:mac:x64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['build:mac:x64'] || '', /node scripts\/run-electron-builder\.js --mac --x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /node scripts\/run-electron-builder\.js --mac --arm64/);
    assert.match(pkg.scripts['package:smoke-test:mac:x64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:smoke-test:mac:arm64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-arm64/);
    assert.match(macBuildScript, /HAGICODE_MAC_BUILD_ARCHS/);
    assert.match(macBuildScript, /build:mac:\$\{arch\}/);
  });

  it('raises macOS open file limits before electron-builder packaging', async () => {
    const runner = await fs.readFile(electronBuilderRunnerPath, 'utf-8');

    assert.match(runner, /HAGICODE_MACOS_NOFILE_LIMIT/);
    assert.match(runner, /ulimit -n/);
    assert.match(runner, /effective_limit.*-lt 16384/);
    assert.match(runner, /electron-builder\/out\/cli\/cli\.js/);
  });

  it('prunes unused Node bin entrypoints before macOS signing', async () => {
    const stagingScript = await fs.readFile(bundledToolchainScriptPath, 'utf-8');
    const smokeTest = await fs.readFile(smokeTestPath, 'utf-8');

    assert.match(stagingScript, /removeUnusedNodeBinEntrypoints/);
    assert.match(stagingScript, /entry !== 'node'/);
    assert.match(stagingScript, /createPosixNpmCompatibilityShim\(stableNpmRelativePath, compatibilityRelativePath\)/);
    assert.match(stagingScript, /pruneNpmGlobalPackagePayload/);
    assert.match(stagingScript, /caniuse-lite/);
    assert.match(stagingScript, /browserslist/);
    assert.match(stagingScript, /lowerName\.endsWith\('\.d\.ts'\)/);
    assert.match(stagingScript, /Pruned \$\{prunedToolchainEntries\} non-runtime npm package entries/);
    assert.match(smokeTest, /node', 'bin', 'corepack'/);
    assert.match(smokeTest, /node', 'bin', 'npx'/);
    assert.match(smokeTest, /unused Node entrypoint must be pruned before packaging/);
    assert.match(smokeTest, /caniuse-lite/);
    assert.match(smokeTest, /npm global package payload contains non-runtime files/);
  });

  it('excludes the bundled Node toolchain from recursive macOS signing', async () => {
    const builder = await fs.readFile(electronBuilderPath, 'utf-8');
    const smokeTest = await fs.readFile(smokeTestPath, 'utf-8');

    assert.match(builder, /afterPack: scripts\/macos-toolchain-signing-hook\.cjs/);
    assert.match(builder, /afterSign: scripts\/macos-toolchain-signing-hook\.cjs/);
    assert.match(builder, /signIgnore:/);
    assert.match(builder, /Contents\/Resources\/extra\/portable-fixed\/toolchain\/\.\*/);
    assert.match(smokeTest, /stashed outside the macOS app during code signing/);
    assert.match(smokeTest, /excluded from recursive macOS code signing/);
  });

  it('macOS signing hook stashes and restores bundled toolchain resources', async () => {
    const hook = await import(macToolchainSigningHookPath);
    const fixtureRoot = path.join(process.cwd(), 'build', 'test-fixtures', 'macos-toolchain-signing-hook');
    const appOutDir = path.join(fixtureRoot, 'mac-arm64');
    const outDir = fixtureRoot;
    const toolchainRoot = path.join(appOutDir, 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'portable-fixed', 'toolchain');
    const markerPath = path.join(toolchainRoot, 'toolchain-manifest.json');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(toolchainRoot, { recursive: true });
    await fs.writeFile(markerPath, '{}\n', 'utf-8');

    const context = { appOutDir, outDir, electronPlatformName: 'darwin' };
    await hook.afterPack(context);
    await assert.rejects(fs.stat(markerPath));

    await hook.afterSign(context);
    assert.equal(await fs.readFile(markerPath, 'utf-8'), '{}\n');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
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
