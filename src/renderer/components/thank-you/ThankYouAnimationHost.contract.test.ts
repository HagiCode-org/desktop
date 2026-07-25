import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const hostPath = path.resolve(process.cwd(), 'src/renderer/components/thank-you/ThankYouAnimationHost.tsx');
const variantPath = path.resolve(process.cwd(), 'src/renderer/components/thank-you/ThankYouVariantView.tsx');
const mainPath = path.resolve(process.cwd(), 'src/renderer/main.tsx');

describe('ThankYouAnimationHost contract', () => {
  it('is fullscreen overlay with Esc/close and tier auto-timeout', async () => {
    const source = await fs.readFile(hostPath, 'utf8');

    assert.match(source, /fixed inset-0/);
    assert.match(source, /Escape/);
    assert.match(source, /closeThankYouAnimation/);
    assert.match(source, /reducedMotionDurationMs|prefers-reduced-motion/);
    assert.match(source, /getThankYouTierTokens/);
    assert.match(source, /data-testid="thank-you-animation-host"/);
  });

  it('renders progressive variants via registry tokens', async () => {
    const source = await fs.readFile(variantPath, 'utf8');

    assert.match(source, /data-tier=/);
    assert.match(source, /data-variant=/);
    assert.match(source, /data-intensity=/);
    assert.match(source, /particleCount/);
  });

  it('is mounted once in renderer shell', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /ThankYouAnimationHost/);
    assert.match(source, /from '\.\/components\/thank-you'/);
  });
});
