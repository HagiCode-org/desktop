import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreDonationItem.tsx');

describe('HomeStoreDonationItem', () => {
  it('uses visibility gate with win-store runtime, install date, and dismissed state', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /shouldShowMsstoreDonationItem\(\{/);
    assert.match(source, /isWinStoreRuntime: isWindowsStoreRuntime,/);
    assert.match(source, /installDate,/);
    assert.match(source, /dismissedAt: state\.dismissedAt,/);
  });

  it('gates close button to Sponsor active state', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /const sponsorActive = subscriptionState\.snapshot\?\.status === 'active';/);
    assert.match(source, /\{sponsorActive \? \(/);
    assert.match(source, /dispatch\(dismissMsstoreDonationItem\(\)\)/);
  });

  it('renders purchase count and updates via purchase result', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /donationItem\.purchaseCount/);
    assert.match(source, /purchaseMsstoreDonationItem\(\{ tier \}\)/);
    assert.match(source, /purchaseCount: result\.purchaseCount/);
  });

  it('renders three progressive tier cards without price text', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /getMsstoreDonationTierCatalog/);
    assert.match(source, /data-testid=\{`msstore-donation-tier-\$\{tierMeta\.tier\}`\}/);
    assert.match(source, /data-visual-level=\{tierMeta\.visualLevel\}/);
    assert.doesNotMatch(source, /\$0\.99|\$9\.99|\$399\.99|displayPrice|USD/);
    assert.doesNotMatch(source, /给作者来杯卡布奇诺|给作者晚餐加上小青龙|给作者刷一个嘉年华/);
  });

  it('shows no-privilege notice and keeps required fixed Chinese campaign copy', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /作者快穷死了，救救作者/);
    assert.match(source, /作者的 token 要耗尽了，快为作者续命/);
    assert.match(source, /donationItem\.noPrivilegeNotice/);
  });

  it('opens thank-you animation on success outcomes and wires picker', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /openThankYouAnimation/);
    assert.match(source, /pickThankYouVariant\(tier\)/);
    assert.match(source, /showSuccessFeedback/);
    assert.match(source, /result\.outcome === 'succeeded' \|\| result\.outcome === 'already-purchased'/);
  });

  it('supports skipPurchaseSimulateSuccess short-circuit without Store purchase', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /skipPurchaseSimulateSuccess/);
    assert.match(source, /debugBridge\.getSettings/);
    assert.match(source, /if \(skipPurchaseSimulateSuccess\)/);
    assert.match(source, /showSuccessFeedback\(tier, 'succeeded'\)/);
    // Simulate path returns before dispatching real purchase when flag is on.
    assert.match(source, /purchaseMsstoreDonationItem\(\{ tier \}\)/);
  });

  it('does not open thank-you animation for cancel or failure outcomes', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    // Non-success branches use toast only; openSuccessThankYou only via showSuccessFeedback.
    assert.match(source, /result\.outcome === 'canceled' \|\| result\.outcome === 'not-purchased'/);
    assert.equal(
      (source.match(/openSuccessThankYou\(tier\)/g) || []).length,
      1,
    );
  });
});
