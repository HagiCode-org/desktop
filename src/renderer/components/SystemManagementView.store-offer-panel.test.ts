import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const homeStoreOfferPanelPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreOfferPanel.tsx');
const homeStoreDonationItemPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreDonationItem.tsx');

describe('homepage store offer panel wiring', () => {
  it('maps the store panels into the entitlement-driven rail and band', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /import HomeStoreDonationItem from '\.\/HomeStoreDonationItem';/);
    assert.match(source, /import HomeStoreOfferPanel from '\.\/HomeStoreOfferPanel';/);
    assert.match(source, /import HomeStoreRatingPrompt from '\.\/HomeStoreRatingPrompt';/);
    assert.match(source, /useHomeEntitlementTier\(\)/);
    assert.match(
      source,
      /offer: <HomeStoreOfferPanel isWindowsStoreRuntime=\{distributionState\.winStoreMode\} compact=\{railPlan\.offerCompact\} \/>/,
    );
    assert.match(source, /donation: <HomeStoreDonationItem isWindowsStoreRuntime=\{distributionState\.winStoreMode\} \/>/);
    assert.match(source, /rating: <HomeStoreRatingPrompt \/>/);
    assert.doesNotMatch(source, /BlogFeedCard/);
    assert.match(source, /railPlan\.side\.map/);
    assert.match(source, /data-home-region="rail"/);
  });

  it('keeps store and non-store actions connected to the existing sponsor and TurboEngine flows', async () => {
    const source = await fs.readFile(homeStoreOfferPanelPath, 'utf8');

    assert.match(source, /loadSubscriptionSnapshot/);
    assert.match(source, /loadTurboEngineLicenseSnapshot/);
    assert.match(source, /purchaseSubscription/);
    assert.match(source, /purchaseTurboEngineLicense/);
    assert.match(source, /HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL/);
    assert.match(source, /function CommerceRow/);
    assert.match(source, /useCommercePreviewDebug/);
    assert.match(source, /navigateTo\('subscription'\)/);
    assert.match(source, /navigateTo\('turboengine'\)/);
    assert.match(source, /!effectiveWindowsStoreRuntime \?/);
    assert.match(source, /&& !subscriptionActive/);
    assert.match(source, /&& !turboEngineActive/);
    assert.doesNotMatch(source, /HAGICODE_SPONSOR_PLAN_STORE_WEB_URL/);
    assert.doesNotMatch(source, /HAGICODE_TURBOENGINE_STORE_WEB_URL/);
    assert.match(source, /commerce-premium-shell rounded-3xl p-6 sm:p-7/);
    assert.match(source, /commerce-premium-panel mt-5 flex flex-col gap-3 rounded-2xl p-4/);
  });

  it('loads donation state, purchases donation item, and gates dismiss on sponsor state', async () => {
    const source = await fs.readFile(homeStoreDonationItemPath, 'utf8');
    const sliceSource = await fs.readFile(
      path.resolve(process.cwd(), 'src/renderer/store/slices/msstoreDonationItemSlice.ts'),
      'utf8',
    );

    assert.match(source, /typeof window\.electronAPI\.msstoreDonationItem\?\.getState === 'function'/);
    assert.match(source, /dispatch\(purchaseMsstoreDonationItem\(/);
    assert.match(source, /dismissMsstoreDonationItem/);
    assert.match(source, /subscriptionState\.snapshot\?\.status === 'active'/);
    assert.match(sliceSource, /getBridge\(\)\.getState\(\)/);
    assert.match(sliceSource, /getBridge\(\)\.purchase\(/);
    assert.match(sliceSource, /getBridge\(\)\.dismiss\(\)/);
  });
});
