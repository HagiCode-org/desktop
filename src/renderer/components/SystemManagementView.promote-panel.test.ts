import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');

describe('homepage promotion panel placement', () => {
  it('renders the promotion panel in the supporting rail directly after the Licenses and Sponsorship panel', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /import HomePromotePanel from '\.\/HomePromotePanel';/);
    assert.match(
      source,
      /<HomeStoreOfferPanel isWindowsStoreRuntime=\{distributionState\.winStoreMode\} \/>\s*<HomePromotePanel \/>\s*<HomeStoreRatingPrompt \/>/s,
    );
  });

  it('mounts the promotion panel once', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.equal((source.match(/<HomePromotePanel \/>/g) ?? []).length, 1);
  });

  it('keeps the existing homepage tour anchors on the homepage panels', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'update-reminder'/);
    assert.match(source, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'service-card'/);
    assert.match(source, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'log-access'/);
    assert.match(source, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'version-section'/);
  });
});
