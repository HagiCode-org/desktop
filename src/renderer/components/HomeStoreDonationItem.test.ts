import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreDonationItem.tsx');

describe('HomeStoreDonationItem', () => {
  it('uses visibility gate with win-store runtime, install date, and dismissed state', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /shouldShowMsstoreDonationItem\(\{/);
    assert.match(source, /isWinStoreRuntime: isWindowsStoreRuntime,/);
    assert.match(source, /installDate,/);
    assert.match(source, /dismissedAt: state\.dismissedAt,/);
  });

  it('gates close button to Sponsor active state', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /const sponsorActive = subscriptionState\.snapshot\?\.status === 'active';/);
    assert.match(source, /\{sponsorActive \? \(/);
    assert.match(source, /dispatch\(dismissMsstoreDonationItem\(\)\)/);
  });

  it('renders purchase count and updates via purchase result', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /donationItem\.purchaseCount/);
    assert.match(source, /window\.electronAPI\.msstoreDonationItem\.purchase\(\)/);
    assert.match(source, /purchaseCount: result\.purchaseCount/);
  });

  it('keeps required fixed Chinese campaign copy in component', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /作者快穷死了，救救作者/);
    assert.match(source, /作者的 token 要耗尽了，快为作者续命/);
  });
});
