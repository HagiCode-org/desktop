import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const subscriptionPagePath = path.resolve(process.cwd(), 'src/renderer/components/subscription/SubscriptionPage.tsx');
const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');
const subscriptionTypesPath = path.resolve(process.cwd(), 'src/types/subscription.ts');
const viewSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/viewSlice.ts');

describe('subscription sidebar and shell wiring', () => {
  it('keeps the first-level subscription view visible across runtimes while leaving Store wiring gated', async () => {
    const [sidebarSource, appSource, subscriptionPageSource, storeSource, subscriptionTypesSource, viewSliceSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
      fs.readFile(subscriptionPagePath, 'utf8'),
      fs.readFile(storePath, 'utf8'),
      fs.readFile(subscriptionTypesPath, 'utf8'),
      fs.readFile(viewSlicePath, 'utf8'),
    ]);

    assert.match(sidebarSource, /const subscriptionNavigationItem: NavigationItem = \{/);
    assert.match(sidebarSource, /id: 'subscription'/);
    assert.match(sidebarSource, /labelKey: 'sidebar\.subscription'/);
    assert.match(sidebarSource, /return \[\.\.\.baseItems, subscriptionNavigationItem\];/);
    assert.doesNotMatch(sidebarSource, /distributionState\.winStoreMode/);
    assert.doesNotMatch(sidebarSource, /typeof window\.electronAPI\.subscription\?\.getSnapshot === 'function'/);
    assert.doesNotMatch(sidebarSource, /selectSubscriptionSnapshot/);
    assert.doesNotMatch(sidebarSource, /getSubscriptionBadgeLabel/);
    assert.doesNotMatch(sidebarSource, /getSubscriptionBadgeVariant/);
    assert.doesNotMatch(sidebarSource, /item\.id === 'subscription'/);
    assert.match(appSource, /import SubscriptionPage from '\.\/components\/subscription\/SubscriptionPage';/);
    assert.match(appSource, /currentView === 'subscription' && <SubscriptionPage \/>/);
    assert.match(subscriptionPageSource, /const subscriptionBridgeAvailable = typeof window\.electronAPI\.subscription\?\.getSnapshot === 'function';/);
    assert.match(subscriptionPageSource, /if \(subscriptionBridgeAvailable && !snapshot && !isLoading\) \{/);
    assert.match(subscriptionPageSource, /openStorePage\(HAGICODE_SPONSOR_PLAN_STORE_WEB_URL\)/);
    assert.match(subscriptionPageSource, /openStorePage\(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL\)/);
    assert.match(subscriptionTypesSource, /export const HAGICODE_SPONSOR_PLAN_STORE_WEB_URL = `https:\/\/apps\.microsoft\.com\/detail\/\$\{HAGICODE_SPONSOR_PLAN_STORE_ID\}`;/);
    assert.match(subscriptionTypesSource, /export const HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL = `https:\/\/apps\.microsoft\.com\/detail\/\$\{HAGICODE_DESKTOP_WINDOWS_STORE_ID\}`;/);
    assert.match(storeSource, /subscriptionFeatureEnabled \? \[store\.dispatch\(loadSubscriptionSnapshot\(\)\)\] : \[\]/);
    assert.match(storeSource, /setSubscriptionSnapshotFromEvent/);
    assert.match(viewSliceSource, /'subscription'/);
  });
});
