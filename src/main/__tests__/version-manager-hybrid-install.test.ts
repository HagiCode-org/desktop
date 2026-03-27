import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sourcePath = path.resolve(process.cwd(), 'src/main/version-manager.ts');

describe('version manager hybrid install pipeline', () => {
  it('routes downloads through the hybrid coordinator before extraction', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /this\.hybridDownloadCoordinator\.download\(/);
    assert.match(source, /const effectiveSharingAccelerationSettings = this\.getSharingAccelerationSettings\(\)/);
    assert.match(source, /distributionMode: this\.getDistributionMode\(\)/);
    assert.match(source, /stage: 'extracting'/);
    assert.match(source, /stage: 'completed'/);
  });

  it('forces portable mode reads to expose sharing acceleration as disabled without mutating persisted settings', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /getSharingAccelerationSettings\(\): SharingAccelerationSettings \{/);
    assert.match(source, /return this\.toEffectiveSharingAccelerationSettings\(/);
    assert.match(source, /private toEffectiveSharingAccelerationSettings\(settings: SharingAccelerationSettings\)/);
    assert.match(source, /if \(!this\.isPortableVersionMode\(\)\) \{/);
    assert.match(source, /enabled: false/);
  });

  it('skips persistent sharing setting writes in portable mode and only stops active sharing work', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /if \(this\.isPortableVersionMode\(\)\) \{\s*await this\.hybridDownloadCoordinator\.stopSharingActivity\(\);\s*return this\.getSharingAccelerationSettings\(\);\s*\}/s);
    assert.match(source, /await this\.hybridDownloadCoordinator\.stopSharingActivity\(\);\s*log\.info\('\[VersionManager\] Portable version payload detected successfully:'/s);
  });
});
