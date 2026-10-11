import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/HomePromotePanel.tsx');

describe('HomePromotePanel render contract', () => {
  it('renders a labeled region with a localized heading and nothing without an item', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /<section\s+aria-label=\{t\('homePromote\.regionLabel'\)\}/);
    assert.match(source, /\{t\('homePromote\.title'\)\}/);
    assert.match(source, /if \(!current\) return null;/);
  });

  it('keeps a fixed-height shell that switches between rail and wide container widths', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /className="@container /);
    assert.match(source, /flex h-\[29rem\] flex-col @md:h-\[16rem\]/);
    assert.match(source, /@md:flex-row/);
    assert.match(source, /@md:w-\[45%\]/);
  });

  it('clamps the title and description and pins the call-to-action row to the bottom', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /line-clamp-2/);
    assert.match(source, /line-clamp-3/);
    assert.match(source, /mt-auto flex flex-wrap items-center justify-between/);
    assert.match(source, /current\.ctaLabel \?\? t\('homePromote\.defaultCta'\)/);
  });

  it('shows the cached image in a 16:9 frame with explicit dimensions and falls back to text when absent or broken', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /const imageUrl = image \? imagesByKey\[image\.key\] : undefined;/);
    assert.match(source, /const showImage = Boolean\(image && imageUrl && !brokenImageKeys\.has\(image\.key\)\);/);
    assert.match(source, /\{showImage && image && imageUrl \? \(/);
    assert.match(source, /className="aspect-video w-full shrink-0 overflow-hidden/);
    assert.match(source, /className="h-full w-full object-cover"/);
    assert.match(source, /width=\{image\.width\}/);
    assert.match(source, /height=\{image\.height\}/);
    assert.match(source, /decoding="async"/);
    assert.match(source, /alt=\{image\.alt\}/);
    assert.match(source, /onError=\{\(\) => setBrokenImageKeys\(\(previous\) => new Set\(previous\)\.add\(image\.key\)\)\}/);
  });

  it('shows previous, next, position and pause controls only for more than one item', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /\{count > 1 \? \(/);
    assert.match(source, /aria-label=\{t\('homePromote\.previous'\)\}/);
    assert.match(source, /aria-label=\{t\('homePromote\.next'\)\}/);
    assert.match(source, /t\('homePromote\.position', \{ current: currentIndex \+ 1, total: count \}\)/);
    assert.match(source, /aria-label=\{paused \? t\('homePromote\.resume'\) : t\('homePromote\.pause'\)\}/);
    assert.match(source, /aria-pressed=\{paused\}/);
  });

  it('drives auto-rotation from shouldAutoRotate and pauses on hover, focus, user pause, hidden window and reduced motion', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /shouldAutoRotate\(\{ count, hovered, focused, paused, reducedMotion, documentVisible \}\)/);
    assert.match(source, /HOME_PROMOTE_ROTATE_INTERVAL_MS/);
    assert.match(source, /onMouseEnter=\{\(\) => setHovered\(true\)\}/);
    assert.match(source, /onMouseLeave=\{\(\) => setHovered\(false\)\}/);
    assert.match(source, /onFocus=\{\(\) => setFocused\(true\)\}/);
    assert.match(source, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
    assert.match(source, /REDUCED_MOTION_QUERY = '\(prefers-reduced-motion: reduce\)'/);
    assert.match(source, /query\.addEventListener\('change', handleChange\)/);
  });

  it('announces only manual navigation politely and never during auto-rotation', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /aria-live="polite" className="sr-only"/);
    assert.equal((source.match(/setAnnouncement\(/g) ?? []).length, 1);
    assert.match(source, /setAnnouncement\(items\[nextIndex\]\?\.title \?\? ''\)/);
  });

  it('opens the link through the bridge and reports a failed open with a localized toast', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /window\.electronAPI\.openExternal\(current\.link\)/);
    assert.match(source, /toast\.error\(t\('homePromote\.openFailed'\)\)/);
  });

  it('loads on mount and language change and reloads on the hourly timer', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /resolveDesktopLanguageCode\(i18n\.resolvedLanguage \?\? i18n\.language\)/);
    assert.match(source, /void dispatch\(loadHomePromoteItems\(language\)\);/);
    assert.match(source, /window\.setInterval\(\(\) => \{\s*void dispatch\(loadHomePromoteItems\(language\)\);\s*\}, HOME_PROMOTE_REFRESH_INTERVAL_MS\)/s);
  });

  it('uses localized copy and Desktop theme tokens only', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.doesNotMatch(source, /[぀-ヿ一-鿿가-힯Ѐ-ӿ]/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(source, /\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/);
    assert.match(source, /bg-card/);
    assert.match(source, /text-muted-foreground/);
    assert.match(source, /border-border/);
  });
});
