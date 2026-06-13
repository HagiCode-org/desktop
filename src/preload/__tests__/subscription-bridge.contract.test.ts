import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('subscription preload bridge contract', () => {
  it('exposes the typed subscription bridge only when the feature flag is present', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ SubscriptionBridge \} from '\.\.\/types\/subscription\.js';/);
    assert.match(source, /import \{ subscriptionChannels \} from '\.\.\/types\/subscription\.js';/);
    assert.match(source, /const SUBSCRIPTION_FEATURE_ARG = '--desktop-subscription-enabled=1';/);
    assert.match(source, /const subscriptionFeatureEnabled = process\.argv\.includes\(SUBSCRIPTION_FEATURE_ARG\);/);
    assert.match(source, /const subscriptionBridge: SubscriptionBridge = \{/);
    assert.match(source, /getSnapshot: \(options\) => ipcRenderer\.invoke\(subscriptionChannels\.getSnapshot, options\)/);
    assert.match(source, /refresh: \(\) => ipcRenderer\.invoke\(subscriptionChannels\.refresh\)/);
    assert.match(source, /purchase: \(\) => ipcRenderer\.invoke\(subscriptionChannels\.purchase\)/);
    assert.match(source, /ipcRenderer\.on\(subscriptionChannels\.changed, listener\)/);
    assert.match(source, /\.\.\.\(subscriptionFeatureEnabled \? \{ subscription: subscriptionBridge \} : \{\}\)/);
  });
});
