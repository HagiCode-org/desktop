import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPath = path.resolve(process.cwd(), 'src/main/debug-options-settings.ts');

describe('debug options settings domain contract', () => {
  it('includes msstore install date raw snapshot and save plumbing', async () => {
    const source = await fs.readFile(settingsPath, 'utf8');

    assert.match(source, /getMsstoreRatingPromptState/);
    assert.match(source, /setMsstoreRatingPromptState/);
    assert.match(source, /msstoreInstallDateRaw/);
    assert.match(source, /msstoreInstallAgeDays: calculateInstallAgeDays/);
    assert.match(source, /setMsstoreRatingPromptState\(\{\s*installDate: nextInstallDateRaw,/s);
    assert.match(source, /Math\.floor\(diffMs \/ \(24 \* 60 \* 60 \* 1000\)\)/);
  });
});
