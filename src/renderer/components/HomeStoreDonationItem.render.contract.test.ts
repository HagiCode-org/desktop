import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreDonationItem.tsx');

describe('HomeStoreDonationItem render contract', () => {
  it('routes every user-facing string through i18n keys without hardcoded language copy', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /t\('donationItem\.headline'/);
    assert.match(source, /t\('donationItem\.subheadline'/);
    assert.doesNotMatch(source, /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff]/);
    assert.match(source, /t\('donationItem\.purchaseCount'/);
    assert.match(source, /t\('donationItem\.actions\.purchasing'/);
    assert.match(source, /t\('donationItem\.actions\.close'/);
    assert.match(source, /donationItem\.messages\.purchaseOutcome/);
    assert.match(source, /t\('donationItem\.messages\.purchaseFailed'/);
    assert.match(source, /t\('donationItem\.messages\.dismissFailed'/);
    assert.match(source, /t\('donationItem\.messages\.dismissed'/);
    assert.match(source, /donationItem\.noPrivilegeNotice/);
    assert.match(source, /donationItem\.tiers\.\$\{tier\}\.shortName|tierMeta\.shortNameKey/);
    // Primary labels must not hardcode English Coffee/Dinner/Candy or Store long copy.
    assert.doesNotMatch(source, /['"]Coffee['"]|['"]Dinner['"]|['"]Candy['"]/);
    assert.doesNotMatch(source, /\$0\.99|\$9\.99|\$399/);
  });

  it('relies on shell-mounted ThankYouAnimationHost rather than local overlay', async () => {
    const source = await fs.readFile(componentPath, 'utf8');
    assert.doesNotMatch(source, /ThankYouAnimationHost/);
    assert.match(source, /openThankYouAnimation/);
  });
});
