import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/turboengine/TurboEnginePage.tsx');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/turboEngineLicenseSlice.ts');
const typesPath = path.resolve(process.cwd(), 'src/types/turboengine-license.ts');

describe('TurboEngine workspace renderer', () => {
  it('renders an article-first TurboEngine workspace with diagnostics, refresh, purchase, and Store handoff paths', async () => {
    const [pageSource, sliceSource, typesSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(typesPath, 'utf8'),
    ]);

    assert.match(pageSource, /effectiveSnapshot\?\.diagnostics\.length/);
    assert.match(pageSource, /dispatch\(refreshTurboEngineLicenseSnapshot\(\)\)/);
    assert.match(pageSource, /dispatch\(purchaseTurboEngineLicense\(\)\)/);
    assert.match(pageSource, /dispatch\(verifyTurboEngineLicenseStartup\(\)\)/);
    assert.match(pageSource, /turboEngine\.purchaseOutcome\./);
    assert.match(pageSource, /mx-auto max-w-5xl space-y-8 pb-12/);
    assert.match(pageSource, /mx-auto max-w-3xl text-center/);
    assert.match(pageSource, /commerce-premium-shell rounded-3xl px-5 py-8 sm:px-8 sm:py-10/);
    assert.match(pageSource, /useCommercePreviewDebug/);
    assert.match(pageSource, /createDefaultTurboEngineLicenseSnapshot/);
    assert.match(pageSource, /const articleFeatureKeys = \[/);
    assert.match(pageSource, /const purchaseNoticeKeys = \[/);
    assert.match(pageSource, /turboEngine\.article\.unlockTitle/);
    assert.match(pageSource, /turboEngine\.article\.featuresTitle/);
    assert.match(pageSource, /turboEngine\.article\.purchaseNoticeTitle/);
    assert.match(pageSource, /turboEngine\.article\.purchaseNoticeItems\./);
    assert.match(pageSource, /const shouldShowPurchaseAction = bridgeAndStoreAvailable && !isActive/);
    assert.match(pageSource, /const canRefresh = effectiveBridgeAvailable && !effectiveIsRefreshing && !effectiveIsStartupVerifying && !effectiveIsLoading/);
    assert.match(pageSource, /turboEngine\.diagnostics\.sectionTitle/);
    assert.match(pageSource, /system\.commercePanel\.debug\.previewBadge/);
    assert.match(pageSource, /commerce-premium-button justify-between/);
    assert.doesNotMatch(pageSource, /turboEngine\.summary\.lastCheckedLabel/);
    assert.doesNotMatch(pageSource, /turboEngine\.summary\.lastSuccessLabel/);
    assert.doesNotMatch(pageSource, /turboEngine\.runtime\.runtimeLabel/);
    assert.doesNotMatch(pageSource, /turboEngine\.runtime\.sourceLabel/);
    assert.doesNotMatch(pageSource, /turboEngine\.summary\.storeIdLabel/);
    assert.doesNotMatch(pageSource, /turboEngine\.hero\.title/);
    assert.doesNotMatch(pageSource, /turboEngine\.unsupported\.nonStoreDescription/);
    assert.match(pageSource, /effectiveBridgeAvailable \? \(\s*<Button variant="outline" className="commerce-premium-button-secondary justify-between" onClick=\{\(\) => void handleRefresh\(\)\}/s);
    assert.match(pageSource, /openStorePage\(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL\)/);
    assert.doesNotMatch(pageSource, /openStorePage\(HAGICODE_TURBOENGINE_STORE_WEB_URL\)/);
    assert.doesNotMatch(pageSource, /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(320px,0\.95fr\)\]/);
    assert.match(sliceSource, /'turboEngineLicense\/loadSnapshot'/);
    assert.match(sliceSource, /'turboEngineLicense\/verifyStartup'/);
    assert.match(sliceSource, /'turboEngineLicense\/refreshSnapshot'/);
    assert.match(sliceSource, /'turboEngineLicense\/purchase'/);
    assert.match(typesSource, /turboEngineAccess/);
  });
});
