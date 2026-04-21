import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const modelPath = path.resolve(process.cwd(), 'src/renderer/components/prompt-guidance/promptGuidanceModel.ts');
const panelPath = path.resolve(process.cwd(), 'src/renderer/components/prompt-guidance/PromptGuidancePanel.tsx');

describe('promptGuidance renderer cleanup', () => {
  it('keeps renderer ordering registry-driven and removes preferred CLI handling', async () => {
    const [modelSource, panelSource] = await Promise.all([
      fs.readFile(modelPath, 'utf8'),
      fs.readFile(panelPath, 'utf8'),
    ]);

    assert.match(modelSource, /return \[\.\.\.tools\];/);
    assert.equal(modelSource.includes('preferredCliType'), false);
    assert.equal(panelSource.includes('guidance.preferredCliType'), false);
    assert.match(panelSource, /variant="secondary"/);
    assert.match(panelSource, /variant="outline"/);
  });
});
