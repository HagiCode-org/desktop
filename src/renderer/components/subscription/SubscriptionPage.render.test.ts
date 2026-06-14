import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/subscription/SubscriptionPage.tsx');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/subscriptionSlice.ts');

describe('subscription workspace renderer', () => {
  it('renders a centered subscription card with thunk-driven actions and sponsor messaging', async () => {
    const [pageSource, sliceSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
    ]);

    assert.match(pageSource, /isLoading && !snapshot/);
    assert.match(pageSource, /snapshot\.availability !== 'supported'/);
    assert.match(pageSource, /snapshot\.isStale/);
    assert.match(pageSource, /dispatch\(refreshSubscriptionSnapshot\(\)\)/);
    assert.match(pageSource, /dispatch\(purchaseSubscription\(\)\)/);
    assert.match(pageSource, /subscription\.purchaseOutcome\./);
    assert.match(pageSource, /mx-auto max-w-2xl overflow-hidden rounded-\[36px\]/);
    assert.match(pageSource, /subscription\.message\.ongoingTitle/);
    assert.match(pageSource, /subscription\.message\.perksTitle/);
    assert.match(pageSource, /subscription\.message\.unlockNoticeTitle/);
    assert.match(pageSource, /subscription\.message\.unlockNoticeDescription/);
    assert.match(pageSource, /subscription\.message\.activeThanks/);
    assert.match(pageSource, /subscription\.message\.inactivePrompt/);
    assert.doesNotMatch(pageSource, /subscriptionEntitlementNames\.map\(\(entitlement\) => \{/);
    assert.doesNotMatch(pageSource, /selectHasSubscriptionEntitlement/);
    assert.doesNotMatch(pageSource, /subscription\.snapshot\.fields\.lastCheckedAt/);
    assert.match(sliceSource, /createAsyncThunk\(/);
    assert.match(sliceSource, /'subscription\/loadSnapshot'/);
    assert.match(sliceSource, /'subscription\/refreshSnapshot'/);
    assert.match(sliceSource, /'subscription\/purchase'/);
  });
});
