import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('subscription main-process wiring', () => {
  it('gates subscription startup, preload flags, and scheduled refresh behind win-store mode', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /const SUBSCRIPTION_FEATURE_ARG = '--desktop-subscription-enabled=1';/);
    assert.match(source, /const SUBSCRIPTION_PURCHASE_SMOKE_TEST_ARG = '--desktop-subscription-purchase-smoke-test=1';/);
    assert.match(source, /subscriptionFeatureEnabled = distributionModeState\.winStoreMode;/);
    assert.match(source, /subscriptionFeatureEnabled \? SUBSCRIPTION_FEATURE_ARG : null/);
    assert.match(source, /function initializeSubscriptionService\(\): void \{[\s\S]*subscriptionService = new SubscriptionService/);
    assert.match(source, /function scheduleSubscriptionPurchaseSmokeTest\(\): void \{[\s\S]*process\.argv\.includes\(SUBSCRIPTION_PURCHASE_SMOKE_TEST_ARG\)/);
    assert.match(source, /void subscriptionService\.purchase\(\)/);
    assert.match(source, /registerSubscriptionHandlers\(\{[\s\S]*subscriptionService,[\s\S]*\}\);/);
    assert.match(source, /createWindow\(\);\s+initializeSubscriptionService\(\);/);
    assert.match(source, /if \(subscriptionFeatureEnabled && subscriptionService\) \{[\s\S]*await subscriptionService\.refreshOnStartup\(\);/);
    assert.match(source, /subscriptionSyncInterval = setInterval\(\(\) => \{[\s\S]*subscriptionService\?\.refresh\('scheduled'\);/);
    assert.match(source, /scheduleSubscriptionPurchaseSmokeTest\(\);/);
    assert.match(source, /subscriptionService\?\.dispose\(\);/);
    assert.match(source, /disposeSubscriptionHandlers\(\);/);
  });
});
