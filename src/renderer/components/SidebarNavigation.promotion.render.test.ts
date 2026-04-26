import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const cardPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarPromotionCard.tsx');

describe('sidebar promotion renderer integration', () => {
  it('loads active promotion data on locale changes and hides null/error states', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /fetchSidebarPromotion\(promotionLocale, t\('navigation\.promotion\.defaultCta'\)\)/);
    assert.match(source, /setPromotion\(result\)/);
    assert.match(source, /\[promotionLocale, t\]/);
    assert.match(source, /\{promotion \? \(/);
    assert.match(source, /: null\}/);
  });

  it('renders expanded and collapsed card affordances wired to openExternal without changing selected view', async () => {
    const sidebarSource = await fs.readFile(sidebarPath, 'utf8');
    const cardSource = await fs.readFile(cardPath, 'utf8');

    assert.match(sidebarSource, /<SidebarPromotionCard/);
    assert.match(sidebarSource, /onActivate=\{\(url\) => void openExternalUrl\(url\)\}/);
    assert.doesNotMatch(sidebarSource, /switchView\([^)]*promotion/);
    assert.match(cardSource, /collapsed/);
    assert.match(cardSource, /title=\{title\}/);
    assert.match(cardSource, /aria-label=\{title\}/);
    assert.match(cardSource, /promotion\.title/);
    assert.match(cardSource, /promotion\.description/);
    assert.match(cardSource, /promotion\.cta/);
    assert.match(cardSource, /Sparkles/);
  });

  it('keeps collapsed official website icon aligned with ordinary navigation icons', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /collapsed\s*\? 'relative w-full flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2\.5/);
    assert.match(source, /collapsed\s*\? 'flex shrink-0 items-center justify-center'/);
    assert.match(source, /collapsed \? 'h-5 w-5' : 'h-5 w-5 text-foreground'/);
  });
});
