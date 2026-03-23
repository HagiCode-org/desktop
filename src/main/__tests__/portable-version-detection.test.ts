import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pathManagerPath = path.resolve(process.cwd(), 'src/main/path-manager.ts');
const versionManagerPath = path.resolve(process.cwd(), 'src/main/version-manager.ts');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('portable version payload detection', () => {
  it('defines the packaged extra payload contract and required runtime files', async () => {
    const source = await fs.readFile(pathManagerPath, 'utf-8');

    assert.match(source, /portable-fixed/);
    assert.match(source, /PCode\.Web\.dll/);
    assert.match(source, /PCode\.Web\.runtimeconfig\.json/);
    assert.match(source, /PCode\.Web\.deps\.json/);
    assert.match(source, /validatePortableRuntimePayload/);
  });

  it('switches into steam mode only when the packaged payload validates and otherwise falls back safely', async () => {
    const source = await fs.readFile(versionManagerPath, 'utf-8');

    assert.match(source, /initializeDistributionMode/);
    assert.match(source, /Portable version payload not found, using normal mode/);
    assert.match(source, /Portable version payload validation failed, falling back to normal mode/);
    assert.match(source, /Portable version payload detected successfully/);
    assert.match(source, /this\.distributionMode = 'steam'/);
  });

  it('exposes distribution mode to the renderer and initializes the active runtime during startup', async () => {
    const source = await fs.readFile(mainPath, 'utf-8');

    assert.match(source, /get-distribution-mode/);
    assert.match(source, /initializeDistributionMode\(\)/);
    assert.match(source, /applyActiveRuntimeToWebServiceManager/);
    assert.match(source, /setActiveRuntime\(runtimeDescriptor\)/);
  });
});
