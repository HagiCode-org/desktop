import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/subscription/SubscriptionPage.tsx');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/subscriptionSlice.ts');

describe('subscription workspace renderer', () => {
  it('renders loading, stale, unsupported, entitlement, and diagnostics states with thunk-driven actions', async () => {
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
    assert.match(pageSource, /subscriptionEntitlementNames\.map\(\(entitlement\) => \{/);
    assert.match(pageSource, /subscription\.entitlements\.names\.\$\{entitlement\}/);
    assert.match(pageSource, /subscription\.entitlements\.details\.\$\{entitlement\}/);
    assert.match(pageSource, /subscription\.diagnostics\.title/);
    assert.match(pageSource, /selectHasSubscriptionEntitlement\(state, 'sponsorBadge'\)/);
    assert.match(pageSource, /selectHasSubscriptionEntitlement\(state, 'premiumFeatureGate'\)/);
    assert.match(sliceSource, /createAsyncThunk\(/);
    assert.match(sliceSource, /'subscription\/loadSnapshot'/);
    assert.match(sliceSource, /'subscription\/refreshSnapshot'/);
    assert.match(sliceSource, /'subscription\/purchase'/);
  });
});
