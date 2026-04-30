import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildPortableRuntimeSelection,
  resolvePackagedPortableRuntimeSelection,
  resolvePackagedPortableToolchainRoot,
} from '../portable-runtime-layout.ts';

function createExistsSync(paths: string[]): (targetPath: string) => boolean {
  const knownPaths = new Set(paths.map((entry) => path.normalize(entry)));
  return (targetPath) => knownPaths.has(path.normalize(targetPath));
}

describe('portable runtime layout resolution', () => {
  it('prefers canonical packaged portable-fixed runtime when both layouts exist', () => {
    const resourcesPath = '/app/resources';
    const canonicalRoot = path.join(resourcesPath, 'extra', 'portable-fixed', 'current');
    const compatibilityRoot = path.join(resourcesPath, 'extra', 'current');
    const existsSync = createExistsSync([
      canonicalRoot,
      compatibilityRoot,
      path.join(canonicalRoot, 'manifest.json'),
      path.join(canonicalRoot, 'lib', 'PCode.Web.dll'),
      path.join(canonicalRoot, 'lib', 'PCode.Web.runtimeconfig.json'),
      path.join(canonicalRoot, 'lib', 'PCode.Web.deps.json'),
      path.join(compatibilityRoot, 'manifest.json'),
      path.join(compatibilityRoot, 'lib', 'PCode.Web.dll'),
      path.join(compatibilityRoot, 'lib', 'PCode.Web.runtimeconfig.json'),
      path.join(compatibilityRoot, 'lib', 'PCode.Web.deps.json'),
    ]);

    const selection = resolvePackagedPortableRuntimeSelection(
      resourcesPath,
      ['manifest.json', 'lib/PCode.Web.dll', 'lib/PCode.Web.runtimeconfig.json', 'lib/PCode.Web.deps.json'],
      { existsSync },
    );

    assert.equal(selection.bundleRoot, canonicalRoot);
    assert.equal(selection.runtimeRoot, canonicalRoot);
    assert.equal(selection.selectionSource, 'legacy-current-root');
  });

  it('falls back to flattened extra/current when canonical runtime is unavailable', () => {
    const resourcesPath = '/app/resources';
    const compatibilityRoot = path.join(resourcesPath, 'extra', 'current');
    const existsSync = createExistsSync([
      compatibilityRoot,
      path.join(compatibilityRoot, 'manifest.json'),
      path.join(compatibilityRoot, 'lib', 'PCode.Web.dll'),
      path.join(compatibilityRoot, 'lib', 'PCode.Web.runtimeconfig.json'),
      path.join(compatibilityRoot, 'lib', 'PCode.Web.deps.json'),
    ]);

    const selection = resolvePackagedPortableRuntimeSelection(
      resourcesPath,
      ['manifest.json', 'lib/PCode.Web.dll', 'lib/PCode.Web.runtimeconfig.json', 'lib/PCode.Web.deps.json'],
      { existsSync },
    );

    assert.equal(selection.bundleRoot, compatibilityRoot);
    assert.equal(selection.runtimeRoot, compatibilityRoot);
    assert.equal(selection.selectionSource, 'compatibility-flat-extra-root');
  });

  it('uses bundle manifests to select the current macOS member root', () => {
    const bundleRoot = '/app/resources/extra/portable-fixed/current';
    const manifestPath = path.join(bundleRoot, 'bundle-manifest.json');
    const existsSync = createExistsSync([manifestPath]);
    const manifest = JSON.stringify({
      schemaVersion: 1,
      kind: 'macos-universal',
      publicationPlatform: 'osx-universal',
      currentLayout: 'portable-fixed/current/{osx-x64,osx-arm64}',
      fallbackRule: 'When this manifest is absent, Desktop must use portable-fixed/current as the legacy single-root payload.',
      manifestPath: 'bundle-manifest.json',
      includedPlatforms: ['osx-x64', 'osx-arm64'],
      members: [
        { platform: 'osx-x64', relativePath: 'osx-x64', requiredPaths: ['manifest.json'] },
        { platform: 'osx-arm64', relativePath: 'osx-arm64', requiredPaths: ['manifest.json'] },
      ],
    });

    const selection = buildPortableRuntimeSelection(bundleRoot, {
      runtimePlatform: 'darwin',
      runtimeArch: 'arm64',
      existsSync,
      readFileSync: () => manifest,
    });

    assert.equal(selection.runtimeRoot, path.join(bundleRoot, 'osx-arm64'));
    assert.equal(selection.selectionSource, 'bundle-member');
    assert.equal(selection.selectedPlatform, 'osx-arm64');
  });

  it('prefers canonical packaged portable-fixed toolchain root and falls back only when missing', () => {
    const resourcesPath = '/app/resources';
    const canonicalRoot = path.join(resourcesPath, 'extra', 'portable-fixed', 'toolchain');
    const existsSync = createExistsSync([canonicalRoot]);

    const canonical = resolvePackagedPortableToolchainRoot(resourcesPath, { existsSync });
    assert.equal(canonical.toolchainRoot, canonicalRoot);
    assert.equal(canonical.selectionSource, 'canonical-portable-fixed-root');

    const compatibility = resolvePackagedPortableToolchainRoot(resourcesPath, { existsSync: () => false });
    assert.equal(compatibility.toolchainRoot, path.join(resourcesPath, 'extra', 'toolchain'));
    assert.equal(compatibility.selectionSource, 'compatibility-flat-extra-root');
  });
});
