import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';

const runtimeInspectorPath = path.resolve(process.cwd(), 'src/main/omniroute-runtime.ts');
const runtimeManifestPath = path.resolve(process.cwd(), 'resources/manifest.yml');

describe('vendored OmniRoute runtime contract', () => {
  it('pins a Desktop-owned runtime manifest for all supported platforms', async () => {
    const manifestStore = load(await fs.readFile(runtimeManifestPath, 'utf8')) as { desktopExtensions: { omniRouteRuntime: Record<string, unknown> } };
    const manifest = manifestStore.desktopExtensions.omniRouteRuntime as any;

    assert.equal(manifest.packageId, 'omniroute');
    assert.equal(manifest.runtime, 'omniroute');
    assert.equal(typeof manifest.releaseVersionByPlatform['linux-x64'], 'string');
    assert.equal(typeof manifest.releaseVersionByPlatform['osx-x64'], 'string');
    assert.equal(typeof manifest.releaseVersionByPlatform['osx-arm64'], 'string');
    assert.equal(typeof manifest.releaseVersionByPlatform['win-x64'], 'string');
    assert.deepEqual(manifest.expectedLayout.wrapperCandidates, [
      'omniroute.sh',
      'omniroute.cmd',
      'omniroute.bat',
      'omniroute.ps1',
      'bin/omniroute',
      'bin/omniroute.cmd',
      'bin/omniroute.ps1',
    ]);
    assert.equal(manifest.expectedLayout.entryScript, 'bin/omniroute.mjs');
  });

  it('routes OmniRoute inspection through the shared archive-aware vendored runtime validator', async () => {
    const source = await fs.readFile(runtimeInspectorPath, 'utf8');

    assert.match(source, /readOmniRouteRuntimeConfig/);
    assert.match(source, /resolveOmniRouteWrapperPath/);
    assert.match(source, /detectSupportedVendoredRuntimePlatform/);
    assert.match(source, /resolveVendoredRuntimeWrapperPath/);
    assert.match(source, /validateVendoredRuntime\(\{/);
    assert.match(source, /inspectVendoredRuntime\(\{/);
    assert.match(source, /manifestPath: getOmniRouteRuntimeConfigPath\(\)/);
    assert.match(source, /packagedRoot: options\.pathManager\.getOmniRoutePackagedRuntimeRoot\(\)/);
    assert.match(source, /stagedRoot: options\.pathManager\.getOmniRouteRuntimeStagingRoot\(\)/);
    assert.match(source, /runtimeRoot: options\.runtimeRoot \?\? pathManager\.getOmniRouteRuntimeRoot\(\)/);
    assert.match(source, /expectedBundledNodeRuntime: true/);
    assert.match(source, /versionOverrideEnvVar: 'HAGICODE_OMNIROUTE_RUNTIME_VERSION'/);
    assert.doesNotMatch(source, /node_modules', packageName/);
  });
});
