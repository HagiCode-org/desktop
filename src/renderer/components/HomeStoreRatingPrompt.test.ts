import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/HomeStoreRatingPrompt.tsx');
const libPath = path.resolve(process.cwd(), 'src/renderer/lib/msstore-rating-prompt.ts');

describe('HomeStoreRatingPrompt', () => {
  it('gates visibility through shouldShowRatingPrompt and returns null when blocked', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /import \{ shouldShowRatingPrompt \} from '\.\.\/lib\/msstore-rating-prompt\.js';/);
    assert.match(source, /if \(!shouldShowRatingPrompt\(\{ isWindowsStoreRuntime, installDate \}\)\)/);
    assert.match(source, /return null;/);
  });

  it('opens the review URL via openExternal and surfaces a toast on failure', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /HAGICODE_DESKTOP_WINDOWS_STORE_REVIEW_URL/);
    assert.match(source, /window\.electronAPI\.openExternal\(HAGICODE_DESKTOP_WINDOWS_STORE_REVIEW_URL\)/);
    assert.match(source, /toast\.error\(t\('ratingPrompt\.errors\.openFailed'/);
  });

  it('renders the positive invitation title, body and rate action', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /pages:ratingPrompt\.title/);
    assert.match(source, /pages:ratingPrompt\.description/);
    assert.match(source, /pages:ratingPrompt\.actions\.rate/);
  });

  it('does not render any close, dismiss, or cancel affordance', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    // No dismiss/close/cancel UI: no close icon, no aria-label, no class names,
    // and no i18n keys that would render a dismiss/cancel control.
    assert.equal(source.includes('aria-label="close"'), false);
    assert.equal(source.includes('ratingPrompt.dismiss'), false);
    assert.equal(source.includes('ratingPrompt.close'), false);
    assert.equal(source.includes('ratingPrompt.cancel'), false);
    assert.equal(source.includes('不再提示'), false);
    assert.equal(source.includes('本次关闭'), false);
    assert.equal(/className="[^"]*(?:close|dismiss|cancel)[^"]*"/i.test(source), false);
  });

  it('relies on a pure function with no dismiss parameters', async () => {
    const libSource = await fs.readFile(libPath, 'utf8');

    // The public API surface takes no dismiss-related input.
    assert.match(libSource, /export interface ShouldShowRatingPromptInput \{/);
    assert.match(libSource, /isWindowsStoreRuntime: boolean;/);
    assert.match(libSource, /installDate\?: string;/);
    assert.doesNotMatch(libSource, /ShouldShowRatingPromptInput[\s\S]*dismiss/);
  });
});
