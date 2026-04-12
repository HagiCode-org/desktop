import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/SystemDiagnosticPage.tsx');

describe('SystemDiagnosticPage renderer contract', () => {
  it('loads cached diagnostics, reruns through the preload bridge, and copies the latest plain text report', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /getSystemDiagnosticBridge\(\)\.getLast\(\)/);
    assert.match(source, /getSystemDiagnosticBridge\(\)\.run\(\)/);
    assert.match(source, /setResult\(null\);/);
    assert.match(source, /writeTextToClipboard\(result\.report\)/);
    assert.match(source, /systemDiagnostic\.boundary\.description/);
    assert.match(source, /<pre className="font-mono text-sm leading-6 text-foreground whitespace-pre-wrap break-words">/);
  });
});
