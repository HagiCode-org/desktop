import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');
const viewSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/viewSlice.ts');

describe('subscription sidebar and shell wiring', () => {
  it('registers the first-level subscription view only for msstore-enabled runs', async () => {
    const [sidebarSource, appSource, storeSource, viewSliceSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
      fs.readFile(storePath, 'utf8'),
      fs.readFile(viewSlicePath, 'utf8'),
    ]);

    assert.match(sidebarSource, /const subscriptionNavigationItem: NavigationItem = \{/);
    assert.match(sidebarSource, /id: 'subscription'/);
    assert.match(sidebarSource, /labelKey: 'sidebar\.subscription'/);
    assert.match(sidebarSource, /distributionState\.winStoreMode/);
    assert.match(sidebarSource, /typeof window\.electronAPI\.subscription\?\.getSnapshot === 'function'/);
    assert.doesNotMatch(sidebarSource, /selectSubscriptionSnapshot/);
    assert.doesNotMatch(sidebarSource, /getSubscriptionBadgeLabel/);
    assert.doesNotMatch(sidebarSource, /getSubscriptionBadgeVariant/);
    assert.doesNotMatch(sidebarSource, /item\.id === 'subscription'/);
    assert.match(appSource, /import SubscriptionPage from '\.\/components\/subscription\/SubscriptionPage';/);
    assert.match(appSource, /subscriptionFeatureEnabled && currentView === 'subscription' && <SubscriptionPage \/>/);
    assert.match(storeSource, /subscriptionFeatureEnabled \? \[store\.dispatch\(loadSubscriptionSnapshot\(\)\)\] : \[\]/);
    assert.match(storeSource, /setSubscriptionSnapshotFromEvent/);
    assert.match(viewSliceSource, /'subscription'/);
  });
});
