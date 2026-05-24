import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';

const runtimeManifestPath = path.resolve(process.cwd(), 'resources/manifest.yml');
const smokeTestPath = path.resolve(process.cwd(), 'scripts/smoke-test.js');
const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const electronBuilderPath = path.resolve(process.cwd(), 'electron-builder.yml');
const developmentDocPath = path.resolve(process.cwd(), 'docs/development.md');
const releaseReadmePath = path.resolve(process.cwd(), '..', 'hagicode-release', 'README.md');
const macBuildScriptPath = path.resolve(process.cwd(), 'scripts/build-macos.js');
const bundledToolchainScriptPath = path.resolve(process.cwd(), 'scripts/prepare-bundled-toolchain.js');
const electronBuilderRunnerPath = path.resolve(process.cwd(), 'scripts/run-electron-builder.js');
const macToolchainSigningHookPath = path.resolve(process.cwd(), 'scripts/macos-toolchain-signing-hook.cjs');
const buildWorkflowPath = path.resolve(process.cwd(), '.github/workflows/build.yml');
const publishDevWorkflowPath = path.resolve(process.cwd(), '.github/workflows/publish-dev.yml');

describe('embedded runtime packaging configuration', () => {
  it('declares pinned macOS runtime targets in the manifest', async () => {
    const manifestStore = load(await fs.readFile(runtimeManifestPath, 'utf-8')) as { desktopExtensions: { embeddedRuntime: Record<string, unknown> } };
    const manifest = manifestStore.desktopExtensions.embeddedRuntime as any;

    assert.equal(manifest.platforms['osx-x64']?.rid, 'osx-x64');
    assert.equal(manifest.platforms['osx-arm64']?.rid, 'osx-arm64');
    assert.match(manifest.platforms['osx-x64']?.downloadUrl || '', /aspnetcore-runtime-10\.0\.5-osx-x64\.tar\.gz$/);
    assert.match(manifest.platforms['osx-arm64']?.downloadUrl || '', /aspnetcore-runtime-10\.0\.5-osx-arm64\.tar\.gz$/);
  });

  it('smoke test inspects packaged macOS app resources outside app.asar', async () => {
    const source = await fs.readFile(smokeTestPath, 'utf-8');

    assert.match(source, /Contents', 'Resources', 'extra', 'runtime'/);
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
    assert.match(pkg.scripts['build:mac:x64'] || '', /HAGICODE_CODE_SERVER_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /HAGICODE_CODE_SERVER_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['build:mac:x64'] || '', /HAGICODE_OMNIROUTE_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /HAGICODE_OMNIROUTE_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['build:mac:x64'] || '', /node scripts\/run-electron-builder\.js --mac --x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /node scripts\/run-electron-builder\.js --mac --arm64/);
    assert.match(pkg.scripts['package:smoke-test:mac:x64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:smoke-test:mac:arm64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['package:smoke-test:mac:x64'] || '', /HAGICODE_CODE_SERVER_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:smoke-test:mac:arm64'] || '', /HAGICODE_CODE_SERVER_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['package:smoke-test:mac:x64'] || '', /HAGICODE_OMNIROUTE_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:smoke-test:mac:arm64'] || '', /HAGICODE_OMNIROUTE_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['build:mac:x64'] || '', /package:verify-release-archives:mac:x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /package:verify-release-archives:mac:arm64/);
    assert.equal(pkg.scripts['package:verify-release-archives'], 'node scripts/verify-release-archives.js');
    assert.match(pkg.scripts['package:verify-release-archives:mac:x64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:verify-release-archives:mac:arm64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['package:verify-release-archives:mac:x64'] || '', /HAGICODE_OMNIROUTE_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:verify-release-archives:mac:arm64'] || '', /HAGICODE_OMNIROUTE_PLATFORM=osx-arm64/);
    assert.match(macBuildScript, /HAGICODE_MAC_BUILD_ARCHS/);
    assert.match(macBuildScript, /build:mac:\$\{arch\}/);
  });

  it('validates release archive payloads before Windows release ZIP upload', async () => {
    const [buildWorkflow, publishDevWorkflow] = await Promise.all([
      fs.readFile(buildWorkflowPath, 'utf-8'),
      fs.readFile(publishDevWorkflowPath, 'utf-8'),
    ]);

    assert.match(buildWorkflow, /Verify Windows ZIP toolchain payload/);
    assert.match(buildWorkflow, /node scripts\/verify-release-archives\.js --archive/);
    assert.match(buildWorkflow, /zip_path=/);
    assert.match(buildWorkflow, /Publish Windows Release Assets/);
    assert.match(buildWorkflow, /macos-arm64/);
    assert.match(buildWorkflow, /Publish \$\{\{ matrix\.target\.name \}\} Release Assets/);
    assert.doesNotMatch(buildWorkflow, /pkg\/\*\.deb/);
    assert.doesNotMatch(buildWorkflow, /Upload MSIX package/);
    assert.match(publishDevWorkflow, /Verify Windows ZIP toolchain payload/);
    assert.match(publishDevWorkflow, /node scripts\/verify-release-archives\.js --archive/);
    assert.match(publishDevWorkflow, /zip_path=/);
    assert.match(publishDevWorkflow, /Publish Windows Dev Assets/);
    assert.match(publishDevWorkflow, /macos-arm64/);
    assert.match(publishDevWorkflow, /Publish \$\{\{ matrix\.target\.name \}\} Dev Assets/);
    assert.doesNotMatch(publishDevWorkflow, /pkg\/\*\.deb/);
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
    const bundledToolchainContract = await fs.readFile(path.resolve(process.cwd(), 'scripts/bundled-toolchain-contract.js'), 'utf-8');

    assert.match(stagingScript, /removeUnusedNodeBinEntrypoints/);
    assert.match(stagingScript, /entry !== 'node'/);
    assert.match(stagingScript, /materializeNpmCompatibilityPath/);
    assert.match(stagingScript, /installNodeRuntime\(/);
    assert.match(stagingScript, /cleanDeferredPackageRoots/);
    assert.match(stagingScript, /legacyNpmGlobalRoot/);
    assert.match(bundledToolchainContract, /not executable/);
    assert.match(stagingScript, /corepack/);
    assert.match(stagingScript, /npx/);
    assert.match(smokeTest, /validateToolchainPayload/);
  });

  it('excludes the bundled Node toolchain from recursive macOS signing', async () => {
    const builder = await fs.readFile(electronBuilderPath, 'utf-8');
    const smokeTest = await fs.readFile(smokeTestPath, 'utf-8');

    assert.match(builder, /afterPack: scripts\/macos-toolchain-signing-hook\.cjs/);
    assert.match(builder, /afterSign: scripts\/macos-toolchain-signing-hook\.cjs/);
    assert.match(builder, /signIgnore:/);
    assert.match(builder, /Contents\/Resources\/extra\/runtime\/\.\*/);
    assert.match(smokeTest, /stashed outside the macOS app during code signing/);
    assert.match(smokeTest, /excluded from recursive macOS code signing/);
  });

  it('macOS signing hook stashes and restores bundled toolchain resources', async () => {
    const hook = await import(macToolchainSigningHookPath);
    const fixtureRoot = path.join(process.cwd(), 'build', 'test-fixtures', 'macos-toolchain-signing-hook');
    const appOutDir = path.join(fixtureRoot, 'mac-arm64');
    const outDir = fixtureRoot;
    const toolchainRoot = path.join(appOutDir, 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'toolchain');
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
    const toolchainDocs = await fs.readFile(path.resolve(process.cwd(), 'docs/bundled-node-toolchain.md'), 'utf-8');
    const releaseReadme = await fs.readFile(releaseReadmePath, 'utf-8');

    assert.match(builder, /from: resources\/portable-fixed/);
    assert.match(builder, /to: extra\/portable-fixed/);
    assert.match(docs, /resources\/portable-fixed\/current/);
    assert.match(docs, /extra\/portable-fixed\/current/);
    assert.match(toolchainDocs, /Bundled Node Toolchain/);
    assert.match(toolchainDocs, /extra\/runtime\/components\/node\/runtime/);
    assert.match(toolchainDocs, /extra\/runtime\/components\/bundled\/omniroute/);
    assert.match(toolchainDocs, /Desktop owns the portable Node\/toolchain contract/);
    assert.match(docs, /Steam Linux startup compatibility/i);
    assert.match(docs, /Direct CLI startup already works/i);
    assert.match(releaseReadme, /Steam Linux desktop artifact verification/i);
    assert.match(releaseReadme, /direct CLI launch keeps the default graphics path/i);
  });

  it('ships a dedicated Steam wrapper for packaged Linux launches', async () => {
    const builder = await fs.readFile(electronBuilderPath, 'utf-8');
    const docs = await fs.readFile(developmentDocPath, 'utf-8');

    assert.match(builder, /extraFiles:/);
    assert.match(builder, /resources\/linux\/hagicode-steam-wrapper\.sh/);
    assert.match(builder, /to: hagicode-steam-wrapper\.sh/);
    assert.match(builder, /resources\/linux\/hagicode-steam-sandbox\.sh/);
    assert.match(builder, /to: hagicode-steam-sandbox\.sh/);
    assert.match(docs, /hagicode-steam-wrapper\.sh/);
    assert.match(docs, /hagicode-steam-sandbox\.sh/);
    assert.match(docs, /LD_PRELOAD/);
    assert.match(docs, /does not append `--disable-setuid-sandbox` or `--no-sandbox`/);
    assert.match(docs, /https:\/\/docs\.hagicode\.com/);
  });

  it('ships the vendored OmniRoute runtime beside other packaged Desktop resources', async () => {
    const [builder, smokeTest, archiveVerifier] = await Promise.all([
      fs.readFile(electronBuilderPath, 'utf-8'),
      fs.readFile(smokeTestPath, 'utf-8'),
      fs.readFile(path.resolve(process.cwd(), 'scripts/verify-release-archives.js'), 'utf-8'),
    ]);

    assert.match(builder, /from: resources/);
    assert.match(builder, /to: extra\/runtime/);
    assert.match(smokeTest, /packaged vendored OmniRoute runtime uses canonical extra\/runtime\/components\/bundled\/omniroute path/);
    assert.match(smokeTest, /legacy extra\/omniroute\/current path/);
    assert.match(archiveVerifier, /label: 'vendored OmniRoute runtime'/);
    assert.match(archiveVerifier, /suffixParts: \['omniroute', 'current'\]/);
    assert.match(archiveVerifier, /validateOmniRouteRuntimePayload/);
  });
});
