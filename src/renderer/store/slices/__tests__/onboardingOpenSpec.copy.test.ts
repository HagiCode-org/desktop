import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readLocale(locale: 'en-US' | 'zh-CN') {
  const localePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales', locale, 'onboarding.json');
  return JSON.parse(readFileSync(localePath, 'utf-8')) as Record<string, any>;
}

describe('onboarding OpenSpec copy', () => {
  it('documents the supported OpenSpec range in both locales', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const data = readLocale(locale);
      assert.match(data.openspec.versionRangeValue, />\s*1\.0/);
      assert.match(data.openspec.versionRangeValue, /<\s*2\.0/);
      assert.match(data.openspec.successCriteria, /1\.0/);
      assert.match(data.openspec.successCriteria, /2\.0/);
    }
  });

  it('keeps the welcome overview aligned with the four-step flow', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const steps = readLocale(locale).welcome.steps;
      assert.equal(Object.keys(steps).length, 4);
      assert.ok(steps.openSpec);
      assert.ok(steps.download);
      assert.ok(steps.launch);
      assert.equal(steps.agentCli, undefined);
    }
  });

  it('includes retry and manual fallback guidance for install failures', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const openSpec = readLocale(locale).openspec;
      assert.ok(openSpec.retryButton);
      assert.ok(openSpec.verifyButton);
      assert.match(openSpec.manualFallback, /openspec --version/);
      assert.match(openSpec.installCommandLabel, /1\.x|1.x/);
    }
  });
});
