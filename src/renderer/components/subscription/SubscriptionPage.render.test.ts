import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/subscription/SubscriptionPage.tsx');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/subscriptionSlice.ts');

describe('subscription workspace renderer', () => {
  it('renders a summary-first subscription workspace with thunk-driven actions', async () => {
    const [pageSource, sliceSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
    ]);

    assert.match(pageSource, /effectiveIsLoading && !effectiveSnapshot/);
    assert.match(pageSource, /effectiveSnapshot\?\.availability !== 'supported'/);
    assert.match(pageSource, /effectiveSnapshot\?\.isStale/);
    assert.match(pageSource, /dispatch\(refreshSubscriptionSnapshot\(\)\)/);
    assert.match(pageSource, /dispatch\(purchaseSubscription\(\)\)/);
    assert.match(pageSource, /subscription\.purchaseOutcome\./);
    assert.match(pageSource, /mx-auto max-w-5xl space-y-8 pb-12/);
    assert.match(pageSource, /flex max-w-3xl flex-col items-center text-center/);
    assert.match(pageSource, /commerce-premium-shell rounded-3xl px-5 py-8 sm:px-8 sm:py-10/);
    assert.match(pageSource, /useCommercePreviewDebug/);
    assert.match(pageSource, /createDefaultSubscriptionSnapshot/);
    assert.match(pageSource, /const canPurchase = effectiveBridgeAvailable && effectiveSnapshot\?\.availability === 'supported' && !isActive/);
    assert.match(pageSource, /const actionHint = effectiveBridgeAvailable/);
    assert.match(pageSource, /subscription\.summary\.planLabel/);
    assert.match(pageSource, /subscription\.message\.ongoingTitle/);
    assert.match(pageSource, /subscription\.message\.unlockNoticeTitle/);
    assert.match(pageSource, /subscription\.message\.unlockNoticeDescription/);
    assert.match(pageSource, /subscription\.message\.activeThanks/);
    assert.match(pageSource, /subscription\.actions\.manageTitle/);
    assert.match(pageSource, /subscription\.actions\.buyTitle/);
    assert.match(pageSource, /subscription\.actions\.activeHint/);
    assert.match(pageSource, /disabled=\{effectiveIsPurchasing \|\| isPreviewing\}/);
    assert.match(pageSource, /system\.commercePanel\.debug\.previewBadge/);
    assert.match(pageSource, /commerce-premium-button justify-between/);
    assert.match(pageSource, /openStorePage\(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL\)/);
    assert.doesNotMatch(pageSource, /openStorePage\(HAGICODE_SPONSOR_PLAN_STORE_WEB_URL\)/);
    assert.doesNotMatch(pageSource, /subscriptionEntitlementNames\.map\(\(entitlement\) => \{/);
    assert.doesNotMatch(pageSource, /selectHasSubscriptionEntitlement/);
    assert.doesNotMatch(pageSource, /subscription\.snapshot\.fields\.lastCheckedAt/);
    assert.match(sliceSource, /createAsyncThunk\(/);
    assert.match(sliceSource, /'subscription\/loadSnapshot'/);
    assert.match(sliceSource, /'subscription\/verifyStartup'/);
    assert.match(sliceSource, /'subscription\/refreshSnapshot'/);
    assert.match(sliceSource, /'subscription\/purchase'/);
  });
});
