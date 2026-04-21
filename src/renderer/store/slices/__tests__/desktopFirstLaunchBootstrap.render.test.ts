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
    assert.match(source, /bridge\.getCachedSnapshot\?\.?\(\)/);
    assert.match(source, /const snapshot = cachedSnapshot \?\? \(/);
    assert.match(source, /if \(snapshot\.status === 'error'\)/);
    assert.match(source, /setBootstrapPhase\('error'\)/);
    assert.match(source, /setBootstrapPhase\('ready'\)/);
    assert.match(source, /const animationFrame = window\.requestAnimationFrame\(revealShell\);/);
    assert.match(source, /const revealTimeout = window\.setTimeout\(revealShell, 160\);/);
  });

  it('hands the static loading container off to the renderer bootstrap shell, then removes it after shell-ready', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /function removeLoadingContainer\(\): void \{\s*loadingContainer\?\.remove\(\);/s);
    assert.match(source, /function hideLoadingContainer\(\): void \{/);
    assert.match(source, /onRendererMounted=\{hideLoadingContainer\}/);
    assert.match(source, /onShellReady=\{removeLoadingContainer\}/);
    assert.match(source, /onBootstrapErrorVisible=\{hideLoadingContainer\}/);
    assert.equal(source.includes("loadingContainer.remove();"), false);
  });

  it('guards bootstrap IPC waits with renderer-side timeouts so the shell can surface a recoverable error', async () => {
    const source = await fs.readFile(appPath, 'utf8');

    assert.match(source, /const BOOTSTRAP_TIMEOUT_MS = 10000;/);
    assert.match(source, /async function withTimeout<T>\(/);
    assert.match(source, /const cachedSnapshot = requestMode === 'initial'/);
    assert.match(source, /await withTimeout\(bridge\.getSnapshot\(\), 'bootstrap snapshot'\)/);
    assert.match(source, /const postShellInitializationStartedRef = useRef\(false\);/);
    assert.match(source, /if \(bootstrapPhase !== 'ready' \|\| postShellInitializationStartedRef\.current\)/);
    assert.match(source, /await withTimeout\(\s*runCriticalStartupInitialization\(\),\s*'critical startup initialization',/s);
    assert.match(source, /await withTimeout\(\s*window\.electronAPI\.getDistributionMode\(\),\s*'distribution mode lookup',/s);
  });

  it('stages renderer initialization so background work starts after the critical shell bootstrap', async () => {
    const source = await fs.readFile(storePath, 'utf8');
    const criticalSection = source.slice(
      source.indexOf('export async function runCriticalStartupInitialization'),
      source.indexOf('export function startBackgroundStartupInitialization'),
    );
    const backgroundSection = source.slice(
      source.indexOf('export function startBackgroundStartupInitialization'),
    );

    assert.match(source, /export async function runCriticalStartupInitialization\(\): Promise<void>/);
    assert.match(criticalSection, /await store\.dispatch\(initializeI18n\(\)\)\.unwrap\(\);/);
    assert.match(criticalSection, /initializeView\(\)/);
    assert.match(criticalSection, /initializeRemoteMode\(\)/);
    assert.equal(criticalSection.includes('checkOnboardingTrigger()'), false);
    assert.match(source, /export function startBackgroundStartupInitialization\(\): void/);
    assert.match(backgroundSection, /checkOnboardingTrigger\(\)/);
    assert.match(backgroundSection, /initializePackageSource\(\)/);
    assert.match(backgroundSection, /initializeDependency\(\)/);
    assert.match(backgroundSection, /initializeRSSFeed\(\)/);
    assert.match(backgroundSection, /initializeWebService\(\)/);
  });
});
