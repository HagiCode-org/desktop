import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const handlersPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/msstoreDonationItemHandlers.ts');

describe('msstore donation item IPC handlers contract', () => {
  it('registers get/dismiss/purchase IPC handlers and success-class increment logic', async () => {
    const source = await fs.readFile(handlersPath, 'utf8');

    assert.match(source, /msstoreDonationItemChannels\.getState/);
    assert.match(source, /msstoreDonationItemChannels\.dismiss/);
    assert.match(source, /msstoreDonationItemChannels\.purchase/);
    assert.match(source, /window\.webContents\.send\(msstoreDonationItemChannels\.changed, snapshot\)/);
    assert.match(source, /const successOutcomes = new Set<MsstoreDonationItemPurchaseOutcome>\(\[/);
    assert.match(source, /'succeeded'/);
    assert.match(source, /'already-purchased'/);
    assert.match(source, /incrementMsstoreDonationItemPurchaseCount\(\)/);
  });
});
