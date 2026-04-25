import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const runtimeManagerPath = path.resolve(process.cwd(), 'src/main/bundled-node-runtime-manager.ts');
const runtimeManifestPath = path.resolve(process.cwd(), 'resources/embedded-node-runtime/runtime-manifest.json');

describe('bundled node runtime manager contract', () => {
  it('keeps runtime health focused on node and npm while managed CLI packages stay pending-manual', async () => {
    const [source, manifestRaw] = await Promise.all([
      fs.readFile(runtimeManagerPath, 'utf8'),
      fs.readFile(runtimeManifestPath, 'utf8'),
    ]);
    const manifest = JSON.parse(manifestRaw);

    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.layoutVersion, 2);
    assert.equal(manifest.expectedLayout.requiredEntries.includes('bin/openspec[.cmd]'), false);
    assert.equal(manifest.expectedLayout.requiredEntries.includes('bin/skills[.cmd]'), false);
    assert.equal(manifest.expectedLayout.requiredEntries.includes('bin/omniroute[.cmd]'), false);
    assert.equal(manifest.corePackages.openspec.installMode, 'manual');
    assert.equal(manifest.corePackages.openspec.installState, 'pending');
    assert.match(source, /const available = errors\.length === 0 && RUNTIME_COMPONENTS\.every/);
    assert.match(source, /integrity: 'pending'/);
    assert.match(source, /primaryAction: 'manual-install'/);
    assert.match(source, /readInstalledPackageVersion/);
    assert.match(source, /resolveManagedCommandCandidates/);
  });

  it('uses pinned runtime defaults when the staged toolchain manifest is missing', async () => {
    const source = await fs.readFile(runtimeManagerPath, 'utf8');

    assert.match(source, /resolveDesktopActivationPolicy\(manifest: BundledToolchainManifest \| null\)/);
    assert.match(source, /manifest\?\.defaultEnabledByConsumer \?\? this\.runtimeConfig\.defaultEnabledByConsumer/);
    assert.match(source, /getDesktopActivationPolicy\(\)/);
  });
});
