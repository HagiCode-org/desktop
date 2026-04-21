import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const mainPath = path.resolve(process.cwd(), 'src/renderer/main.tsx');
const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');

describe('desktop first-launch renderer bootstrap integration', () => {
  it('keeps explicit loading and error shells in the root app instead of falling through to blank content', async () => {
    const source = await fs.readFile(appPath, 'utf8');

    assert.match(source, /BootstrapLoadingShell/);
    assert.match(source, /BootstrapErrorShell/);
    assert.match(source, /window\.electronAPI\?\.bootstrap/);
    assert.match(source, /const snapshot = requestMode === 'refresh'/);
    assert.match(source, /if \(snapshot\.status === 'error'\)/);
    assert.match(source, /setBootstrapPhase\('error'\)/);
    assert.match(source, /setBootstrapPhase\('ready'\)/);
  });

  it('only removes the static loading container after shell-ready and hides it for recoverable bootstrap errors', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /function removeLoadingContainer\(\): void \{\s*loadingContainer\?\.remove\(\);/s);
    assert.match(source, /function hideLoadingContainer\(\): void \{/);
    assert.match(source, /onShellReady=\{removeLoadingContainer\}/);
    assert.match(source, /onBootstrapErrorVisible=\{hideLoadingContainer\}/);
    assert.equal(source.includes("loadingContainer.remove();"), false);
  });

  it('stages renderer initialization so background work starts after the critical shell bootstrap', async () => {
    const source = await fs.readFile(storePath, 'utf8');

    assert.match(source, /export async function runCriticalStartupInitialization\(\): Promise<void>/);
    assert.match(source, /await store\.dispatch\(initializeI18n\(\)\)\.unwrap\(\);/);
    assert.match(source, /initializeView\(\)/);
    assert.match(source, /checkOnboardingTrigger\(\)/);
    assert.match(source, /initializeRemoteMode\(\)/);
    assert.match(source, /export function startBackgroundStartupInitialization\(\): void/);
    assert.match(source, /initializePackageSource\(\)/);
    assert.match(source, /initializeDependency\(\)/);
    assert.match(source, /initializeRSSFeed\(\)/);
    assert.match(source, /initializeWebService\(\)/);
  });
});
