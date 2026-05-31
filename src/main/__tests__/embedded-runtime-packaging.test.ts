import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';

const runtimeManifestPath = path.resolve(process.cwd(), 'resources/manifest.yml');
const smokeTestPath = path.resolve(process.cwd(), 'scripts/smoke-test.js');
const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const forgeConfigPath = path.resolve(process.cwd(), 'forge.config.js');
const developmentDocPath = path.resolve(process.cwd(), 'docs/development.md');
const releaseReadmePath = path.resolve(process.cwd(), '..', 'hagicode-release', 'README.md');
const macBuildScriptPath = path.resolve(process.cwd(), 'scripts/build-macos.js');
const ciBuildScriptPath = path.resolve(process.cwd(), 'scripts/ci-build.js');
const bundledToolchainScriptPath = path.resolve(process.cwd(), 'scripts/prepare-bundled-toolchain.js');
const electronForgeRunnerPath = path.resolve(process.cwd(), 'scripts/run-electron-forge.js');
const forgePackagingHooksPath = path.resolve(process.cwd(), 'scripts/forge-packaging-hooks.js');
const buildWorkflowPath = path.resolve(process.cwd(), '.github/workflows/build.yml');
const reusableWindowsWorkflowPath = path.resolve(process.cwd(), '.github/workflows/reusable-build-windows.yml');
const reusableUnixWorkflowPath = path.resolve(process.cwd(), '.github/workflows/reusable-build-unix.yml');

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
    const [macBuildScript, ciBuildScript] = await Promise.all([
      fs.readFile(macBuildScriptPath, 'utf-8'),
      fs.readFile(ciBuildScriptPath, 'utf-8'),
    ]);

    assert.equal(pkg.scripts['build:mac'], 'node scripts/build-macos.js');
    assert.match(pkg.scripts['build:mac:x64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['build:mac:x64'] || '', /node scripts\/ci-build\.js --platform mac/);
    assert.match(pkg.scripts['build:mac:arm64'] || '', /node scripts\/ci-build\.js --platform mac/);
    assert.match(pkg.scripts['package:smoke-test:mac:x64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:smoke-test:mac:arm64'] || '', /HAGICODE_EMBEDDED_DOTNET_PLATFORM=osx-arm64/);
    assert.match(pkg.scripts['package:verify-release-archives:mac:x64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-x64/);
    assert.match(pkg.scripts['package:verify-release-archives:mac:arm64'] || '', /HAGICODE_EMBEDDED_NODE_PLATFORM=osx-arm64/);
    assert.match(macBuildScript, /HAGICODE_MAC_BUILD_ARCHS/);
    assert.match(macBuildScript, /build:mac:\$\{arch\}/);
    assert.match(ciBuildScript, /Unsupported macOS package target\(s\)/);
    assert.match(ciBuildScript, /Supported targets: dmg, zip/);
    assert.match(ciBuildScript, /scripts\/run-electron-forge\.js/);
    assert.match(ciBuildScript, /package:verify-release-archives:mac:\$\{arch\}/);
  });

  it('validates release archive payloads before Windows release ZIP upload', async () => {
    const [buildWorkflow, reusableWindowsWorkflow, reusableUnixWorkflow, forgeConfig] = await Promise.all([
      fs.readFile(buildWorkflowPath, 'utf-8'),
      fs.readFile(reusableWindowsWorkflowPath, 'utf-8'),
      fs.readFile(reusableUnixWorkflowPath, 'utf-8'),
      fs.readFile(forgeConfigPath, 'utf-8'),
    ]);

    assert.match(buildWorkflow, /production_build:/);
    assert.match(buildWorkflow, /is_production_build/);
    assert.match(buildWorkflow, /uses: \.\/\.github\/workflows\/reusable-build-windows\.yml/);
    assert.match(buildWorkflow, /uses: \.\/\.github\/workflows\/reusable-build-unix\.yml/);
    assert.match(buildWorkflow, /Publish Windows Release Assets/);
    assert.match(buildWorkflow, /release-assets\/windows\/\*\*\/\*\.msix/);

    assert.match(reusableWindowsWorkflow, /Verify Windows ZIP toolchain payload/);
    assert.match(reusableWindowsWorkflow, /node scripts\/verify-release-archives\.js --archive/);
    assert.match(reusableWindowsWorkflow, /Build Windows \(\$\{\{ matrix\.target\.name \}\}\)/);
    assert.match(reusableWindowsWorkflow, /name: MSIX/);
    assert.match(reusableWindowsWorkflow, /Build Windows MSIX Store package/);
    assert.match(reusableWindowsWorkflow, /Resolve Windows SDK for MSIX packaging/);
    assert.match(reusableWindowsWorkflow, /npm run build:win:store --/);
    assert.match(reusableWindowsWorkflow, /forge\.store-config\.json/);
    assert.match(reusableWindowsWorkflow, /pkg\/store-build-metadata\.json/);
    assert.match(reusableWindowsWorkflow, /WINDOWS_PACKAGE_PUBLISHER: \$\{\{ secrets\.WINDOWS_PACKAGE_PUBLISHER \}\}/);

    assert.match(reusableUnixWorkflow, /linux-appimage/);
    assert.match(reusableUnixWorkflow, /linux-tar-gz/);
    assert.match(reusableUnixWorkflow, /linux-zip/);
    assert.match(reusableUnixWorkflow, /macos-x64-dmg/);
    assert.match(reusableUnixWorkflow, /macos-arm64-zip/);
    assert.match(reusableUnixWorkflow, /builder_target: dmg/);
    assert.match(reusableUnixWorkflow, /builder_target: zip/);
    assert.match(reusableUnixWorkflow, /Resolve macOS signing mode/);
    assert.match(reusableUnixWorkflow, /Build unsigned macOS artifacts/);
    assert.match(reusableUnixWorkflow, /Build signed macOS artifacts/);
    assert.doesNotMatch(reusableUnixWorkflow, /pkg\/\*\.deb/);

    assert.doesNotMatch(reusableWindowsWorkflow, /prepare-msix-release-assets\.js/);
    assert.doesNotMatch(reusableUnixWorkflow, /prepare-msix-release-assets\.js/);
    assert.match(forgeConfig, /@electron-forge\/maker-msix/);
    assert.match(forgeConfig, /@rabbitholesyndrome\/electron-forge-maker-portable/);
    assert.match(forgeConfig, /@electron-addons\/electron-forge-maker-nsis/);
  });

  it('raises macOS open file limits before electron-forge packaging', async () => {
    const runner = await fs.readFile(electronForgeRunnerPath, 'utf-8');

    assert.match(runner, /HAGICODE_MACOS_NOFILE_LIMIT/);
    assert.match(runner, /ulimit -n/);
    assert.match(runner, /effective_limit.*-lt 16384/);
    assert.match(runner, /@electron-forge\/core\/dist\/api\/package\.js/);
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

  it('excludes the packaged runtime from recursive macOS signing', async () => {
    const [forgeConfig, smokeTest] = await Promise.all([
      fs.readFile(forgeConfigPath, 'utf-8'),
      fs.readFile(smokeTestPath, 'utf-8'),
    ]);

    assert.match(forgeConfig, /afterCopyExtraResources/);
    assert.match(forgeConfig, /afterComplete/);
    assert.match(forgeConfig, /extra\/runtime/);
    assert.match(smokeTest, /desktop runtime is excluded from recursive macOS code signing/);
  });

  it('macOS Forge packaging hooks stash and restore packaged runtime resources', async () => {
    const hooks = await import(forgePackagingHooksPath);
    const fixtureRoot = path.join(process.cwd(), 'build', 'test-fixtures', 'forge-packaging-hooks');
    const appPath = path.join(fixtureRoot, 'Hagicode Desktop.app');
    const runtimeRoot = path.join(appPath, 'Contents', 'Resources', 'extra', 'runtime');
    const markerPath = path.join(runtimeRoot, 'marker.json');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(runtimeRoot, { recursive: true });
    await fs.writeFile(markerPath, '{}\n', 'utf-8');

    await hooks.stageForgePackagingResources(appPath, '41.3.0', 'darwin', 'arm64');
    await assert.rejects(fs.stat(markerPath));

    await hooks.restoreForgePackagingResources(appPath, '41.3.0', 'darwin', 'arm64');
    assert.equal(await fs.readFile(markerPath, 'utf-8'), '{}\n');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('ships the optional portable fixed payload through the dedicated extra directory contract', async () => {
    const [hookSource, docs, toolchainDocs, releaseReadme] = await Promise.all([
      fs.readFile(forgePackagingHooksPath, 'utf-8'),
      fs.readFile(developmentDocPath, 'utf-8'),
      fs.readFile(path.resolve(process.cwd(), 'docs/bundled-node-toolchain.md'), 'utf-8'),
      fs.readFile(releaseReadmePath, 'utf-8'),
    ]);

    assert.match(hookSource, /portable-fixed', 'current/);
    assert.match(hookSource, /extra', 'portable-fixed', 'current/);
    assert.match(docs, /resources\/portable-fixed\/current/);
    assert.match(docs, /extra\/portable-fixed\/current/);
    assert.match(toolchainDocs, /Bundled Node Toolchain/);
    assert.match(toolchainDocs, /extra\/runtime\/components\/node\/runtime/);
    assert.match(toolchainDocs, /Desktop owns the portable Node\/toolchain contract/);
    assert.match(docs, /Steam Linux startup compatibility/i);
    assert.match(docs, /Direct CLI startup already works/i);
    assert.match(releaseReadme, /Steam Linux desktop artifact verification/i);
    assert.match(releaseReadme, /direct CLI launch keeps the default graphics path/i);
  });

  it('ships a dedicated Steam wrapper for packaged Linux launches', async () => {
    const [hookSource, docs] = await Promise.all([
      fs.readFile(forgePackagingHooksPath, 'utf-8'),
      fs.readFile(developmentDocPath, 'utf-8'),
    ]);

    assert.match(hookSource, /hagicode-steam-wrapper\.sh/);
    assert.match(hookSource, /hagicode-steam-sandbox\.sh/);
    assert.match(docs, /hagicode-steam-wrapper\.sh/);
    assert.match(docs, /hagicode-steam-sandbox\.sh/);
    assert.match(docs, /LD_PRELOAD/);
    assert.match(docs, /does not append `--disable-setuid-sandbox` or `--no-sandbox`/);
    assert.match(docs, /https:\/\/docs\.hagicode\.com/);
  });
});
