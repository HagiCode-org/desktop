import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const runtimeInspectorPath = path.resolve(process.cwd(), 'src/main/omniroute-runtime.ts');
const runtimeManifestPath = path.resolve(process.cwd(), 'resources/omniroute/runtime-manifest.json');

describe('vendored OmniRoute runtime contract', () => {
  it('pins a Desktop-owned runtime manifest for all supported platforms', async () => {
    const manifest = JSON.parse(await fs.readFile(runtimeManifestPath, 'utf8'));

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

  it('validates vendored metadata, wrapper discovery, and entry script paths without npm globals', async () => {
    const source = await fs.readFile(runtimeInspectorPath, 'utf8');

    assert.match(source, /readOmniRouteRuntimeConfig/);
    assert.match(source, /resolveOmniRouteWrapperPath/);
    assert.match(source, /metadata\.json/);
    assert.match(source, /extra\.bundledNodeRuntime=true/);
    assert.match(source, /getOmniRouteRuntimeConfigPath\(\)/);
    assert.match(source, /pathManager\.getOmniRouteRuntimeRoot\(\)/);
    assert.doesNotMatch(source, /node_modules', packageName/);
  });
});
