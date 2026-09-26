import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sourcePath = path.resolve(process.cwd(), 'src/main/version-manager.ts');

describe('version manager direct install pipeline', () => {
  it('routes install and predownload through the direct coordinator before extraction', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /this\.directDownloadCoordinator\.download\(/);
    assert.match(source, /stage: 'extracting'/);
    assert.match(source, /stage: 'completed'/);
    assert.doesNotMatch(source, /SharingAcceleration|hybridDownloadCoordinator/);
  });

  it('does not read or mutate persisted sharing preferences for portable distributions', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /this\.distributionState\.fusionMode/);
    assert.doesNotMatch(source, /sharing-acceleration|SharingAcceleration|stopSharingActivity/);
  });
});
