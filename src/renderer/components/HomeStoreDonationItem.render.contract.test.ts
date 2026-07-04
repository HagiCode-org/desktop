import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreDonationItem.tsx');

describe('HomeStoreDonationItem render contract', () => {
  it('uses i18n keys for dynamic strings and keeps only required fixed Chinese copy hardcoded', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /作者快穷死了，救救作者/);
    assert.match(source, /作者的 token 要耗尽了，快为作者续命/);
    assert.match(source, /t\('donationItem\.purchaseCount'/);
    assert.match(source, /t\('donationItem\.actions\.purchase'/);
    assert.match(source, /t\('donationItem\.actions\.purchasing'/);
    assert.match(source, /t\('donationItem\.actions\.close'/);
    assert.match(source, /donationItem\.messages\.purchaseOutcome/);
    assert.match(source, /t\('donationItem\.messages\.purchaseFailed'/);
    assert.match(source, /t\('donationItem\.messages\.dismissFailed'/);
    assert.match(source, /t\('donationItem\.messages\.dismissed'/);
  });
});
