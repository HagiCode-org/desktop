import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const homepagePath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const cardPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarPromotionCard.tsx');
const hookPath = path.resolve(process.cwd(), 'src/renderer/hooks/useSidebarPromotion.ts');

describe('homepage promotion renderer integration', () => {
  it('loads active promotion data on locale changes through the shared hook', async () => {
    const source = await fs.readFile(hookPath, 'utf8');

    assert.match(source, /fetchSidebarPromotion\(promotionLocale, t\('navigation\.promotion\.defaultCta'\)\)/);
    assert.match(source, /setPromotion\(result\)/);
    assert.match(source, /\[promotionLocale, t\]/);
  });

  it('renders the promotion card above the blog feed on the homepage instead of the sidebar', async () => {
    const sidebarSource = await fs.readFile(sidebarPath, 'utf8');
    const homepageSource = await fs.readFile(homepagePath, 'utf8');
    const cardSource = await fs.readFile(cardPath, 'utf8');

    assert.doesNotMatch(sidebarSource, /<SidebarPromotionCard/);
    assert.doesNotMatch(sidebarSource, /fetchSidebarPromotion\(/);
    assert.match(homepageSource, /const promotion = useSidebarPromotion\(\);/);
    assert.match(homepageSource, /<SidebarPromotionCard/);
    assert.match(homepageSource, /collapsed=\{false\}/);
    assert.match(homepageSource, /onActivate=\{\(url\) => void handleOpenPromotion\(url\)\}/);
    assert.match(homepageSource, /<BlogFeedCard \/>/);
    assert.match(cardSource, /collapsed/);
    assert.match(cardSource, /title=\{title\}/);
    assert.match(cardSource, /aria-label=\{title\}/);
    assert.match(cardSource, /promotion\.title/);
    assert.match(cardSource, /promotion\.description/);
    assert.match(cardSource, /promotion\.cta/);
    assert.match(cardSource, /promotion\.image/);
    assert.match(cardSource, /<img/);
    assert.match(cardSource, /aspect-video w-full object-cover/);
    assert.match(cardSource, /Sparkles/);
  });

  it('keeps collapsed official website icon aligned with ordinary navigation icons', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /collapsed\s*\? 'relative w-full flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2\.5/);
    assert.match(source, /collapsed\s*\? 'flex shrink-0 items-center justify-center'/);
    assert.match(source, /collapsed \? 'h-5 w-5' : 'h-5 w-5 text-foreground'/);
  });
});
