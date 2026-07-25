import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const hostPath = path.resolve(process.cwd(), 'src/renderer/components/thank-you/ThankYouAnimationHost.tsx');
const variantPath = path.resolve(process.cwd(), 'src/renderer/components/thank-you/ThankYouVariantView.tsx');
const mainPath = path.resolve(process.cwd(), 'src/renderer/main.tsx');

describe('ThankYouAnimationHost contract', () => {
  it('is fullscreen overlay dismissible by click-anywhere, Esc, and tier auto-timeout', async () => {
    const source = await fs.readFile(hostPath, 'utf8');

    assert.match(source, /fixed inset-0/);
    assert.match(source, /Escape/);
    assert.match(source, /closeThankYouAnimation/);
    assert.match(source, /onClick=\{\(\) => dispatch\(closeThankYouAnimation\(\)\)\}/);
    assert.match(source, /reducedMotionDurationMs|prefers-reduced-motion/);
    assert.match(source, /getThankYouTierTokens/);
    assert.match(source, /data-testid="thank-you-animation-host"/);
    assert.doesNotMatch(source, /thank-you-animation-close/);
  });

  it('centers copy without level labels and uses gratitude message keys', async () => {
    const [hostSource, variantSource] = await Promise.all([
      fs.readFile(hostPath, 'utf8'),
      fs.readFile(variantPath, 'utf8'),
    ]);

    assert.match(variantSource, /items-center justify-center/);
    assert.doesNotMatch(variantSource, /tier ·|variant-label|v\{variantId/);
    assert.match(hostSource, /donationItem\.thankYouAnimation\.title/);
    assert.match(hostSource, /donationItem\.thankYouAnimation\.message/);
    assert.doesNotMatch(hostSource, /noPrivilege/);
  });

  it('is mounted once in renderer shell', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /ThankYouAnimationHost/);
    assert.match(source, /from '\.\/components\/thank-you'/);
  });
});
