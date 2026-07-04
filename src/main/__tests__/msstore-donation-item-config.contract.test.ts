import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const configPath = path.resolve(process.cwd(), 'src/main/config.ts');

describe('msstore donation item config contract', () => {
  it('exposes schema defaults, normalization, and config manager helpers', async () => {
    const source = await fs.readFile(configPath, 'utf8');

    assert.match(source, /export interface MsstoreDonationItemState \{/);
    assert.match(source, /purchaseCount: number;/);
    assert.match(source, /dismissedAt\?: string;/);
    assert.match(source, /msstoreDonationItem\?: MsstoreDonationItemState;/);
    assert.match(source, /export const DEFAULT_MSSTORE_DONATION_ITEM_STATE: MsstoreDonationItemState = \{/);
    assert.match(source, /purchaseCount: 0,/);
    assert.match(source, /export function normalizeMsstoreDonationItemState\(/);
    assert.match(source, /getMsstoreDonationItemState\(\): MsstoreDonationItemState \{/);
    assert.match(source, /setMsstoreDonationItemState\(nextState: MsstoreDonationItemState\): MsstoreDonationItemState \{/);
    assert.match(source, /incrementMsstoreDonationItemPurchaseCount\(\): MsstoreDonationItemState \{/);
  });
});
