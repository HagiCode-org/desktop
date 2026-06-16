import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('subscription main-process wiring', () => {
  it('gates subscription startup, preload flags, and scheduled refresh behind win-store mode', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /const SUBSCRIPTION_FEATURE_ARG = '--desktop-subscription-enabled=1';/);
    assert.match(source, /const TURBOENGINE_LICENSE_FEATURE_ARG = '--desktop-turboengine-license-enabled=1';/);
    assert.match(source, /const SUBSCRIPTION_PURCHASE_SMOKE_TEST_ARG = '--desktop-subscription-purchase-smoke-test=1';/);
    assert.match(source, /subscriptionFeatureEnabled = distributionModeState\.winStoreMode;/);
    assert.match(source, /turboEngineLicenseFeatureEnabled = distributionModeState\.winStoreMode;/);
    assert.match(source, /subscriptionFeatureEnabled \? SUBSCRIPTION_FEATURE_ARG : null/);
    assert.match(source, /turboEngineLicenseFeatureEnabled \? TURBOENGINE_LICENSE_FEATURE_ARG : null/);
    assert.match(source, /resolveTurboEngineDlcProgramOption,/);
    assert.match(source, /resolveTurboEngineDlcProgramOption: \(\) => resolveTurboEngineDlcProgramOption\(/);
    assert.match(source, /turboEngineLicenseService\?\.getCurrentSnapshot\(\) \?\? null/);
    assert.match(source, /function initializeSubscriptionService\(\): void \{[\s\S]*subscriptionService = new SubscriptionService/);
    assert.match(source, /function initializeTurboEngineLicenseService\(\): void \{[\s\S]*turboEngineLicenseService = new TurboEngineLicenseService/);
    assert.match(source, /productConfig: turboEngineProductConfig/);
    assert.match(source, /turboEngineLicenseService\.onDidChange\(\(\) => \{[\s\S]*scheduleTurboEngineBackendSync\('license-changed'\);/);
    assert.match(source, /function scheduleTurboEngineBackendSync\(reason: string\): void \{/);
    assert.match(source, /async function syncTurboEngineBackendState\(reason: string\): Promise<void> \{/);
    assert.match(source, /if \(status\.status === 'starting'\) \{[\s\S]*scheduleTurboEngineBackendSync\(`\$\{reason\}-after-startup`\);/);
    assert.match(source, /await webServiceManager\.restart\(\)/);
    assert.match(source, /function scheduleSubscriptionPurchaseSmokeTest\(\): void \{[\s\S]*process\.argv\.includes\(SUBSCRIPTION_PURCHASE_SMOKE_TEST_ARG\)/);
    assert.match(source, /void subscriptionService\.purchase\(\)/);
    assert.match(source, /registerSubscriptionHandlers\(\{[\s\S]*subscriptionService,[\s\S]*\}\);/);
    assert.match(source, /registerTurboEngineLicenseHandlers\(\{[\s\S]*turboEngineLicenseService,[\s\S]*\}\);/);
    assert.match(source, /createWindow\(\);\s+initializeSubscriptionService\(\);\s+initializeTurboEngineLicenseService\(\);/);
    assert.match(source, /function triggerStartupStoreLicenseRefresh\(\): void \{/);
    assert.match(source, /void subscriptionService\.refreshOnStartup\(\)\.catch/);
    assert.match(source, /void turboEngineLicenseService\.verifyOnStartup\(\)\.catch/);
    assert.match(source, /triggerStartupStoreLicenseRefresh\(\);/);
    assert.match(source, /subscriptionSyncInterval = setInterval\(\(\) => \{[\s\S]*subscriptionService\?\.refresh\('scheduled'\);/);
    assert.match(source, /turboEngineLicenseSyncInterval = setInterval\(\(\) => \{[\s\S]*turboEngineLicenseService\?\.refresh\('scheduled'\);/);
    assert.match(source, /scheduleSubscriptionPurchaseSmokeTest\(\);/);
    assert.match(source, /subscriptionService\?\.dispose\(\);/);
    assert.match(source, /turboEngineLicenseService\?\.dispose\(\);/);
    assert.match(source, /disposeSubscriptionHandlers\(\);/);
    assert.match(source, /disposeTurboEngineLicenseHandlers\(\);/);
  });
});
