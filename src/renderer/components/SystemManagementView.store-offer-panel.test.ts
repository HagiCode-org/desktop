import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const homeStoreOfferPanelPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreOfferPanel.tsx');
const homeStoreDonationItemPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreDonationItem.tsx');

describe('homepage store offer panel wiring', () => {
  it('renders the homepage store offer panel above the active version panel', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /import HomeStoreDonationItem from '\.\/HomeStoreDonationItem';/);
    assert.match(source, /import HomeStoreOfferPanel from '\.\/HomeStoreOfferPanel';/);
    assert.match(source, /import HomeStoreRatingPrompt from '\.\/HomeStoreRatingPrompt';/);
    assert.match(
      source,
      /<div className="space-y-6">\s*<HomeStoreDonationItem isWindowsStoreRuntime=\{distributionState\.winStoreMode\} \/>\s*<HomeStoreOfferPanel isWindowsStoreRuntime=\{distributionState\.winStoreMode\} \/>\s*<HomeStoreRatingPrompt \/>\s*\{activeVersion \?/s,
    );
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

    assert.match(source, /window\.electronAPI\.msstoreDonationItem\?\.getState\(\)/);
    assert.match(source, /window\.electronAPI\.msstoreDonationItem\.purchase\(\)/);
    assert.match(source, /window\.electronAPI\.msstoreDonationItem\.dismiss\(\)/);
    assert.match(source, /subscriptionState\.snapshot\?\.status === 'active'/);
  });
});
