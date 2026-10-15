import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

async function readCreateWindowSource(): Promise<string> {
  const source = await fs.readFile(mainPath, 'utf8');
  const start = source.indexOf('function createWindow(): void {');
  const end = source.indexOf('function initializeSubscriptionService(): void {');

  assert.ok(start >= 0 && end > start, 'createWindow() must be locatable in main.ts');
  return source.slice(start, end);
}

describe('main window startup contract', () => {
  it('creates the window at the work-area size so the first layout pass is final', async () => {
    const createWindowSource = await readCreateWindowSource();

    assert.match(
      createWindowSource,
      /screen\.getDisplayNearestPoint\(screen\.getCursorScreenPoint\(\)\)\.workArea/,
    );

    const constructorCall = createWindowSource.match(/new ElectronBrowserWindow\(\{([\s\S]*?)\n {2}\}\);/);
    assert.ok(constructorCall, 'BrowserWindow constructor call must be locatable');
    const options = constructorCall[1];

    for (const key of ['x', 'y', 'width', 'height']) {
      assert.match(options, new RegExp(`^\\s+${key},$`, 'm'), `BrowserWindow options must pass ${key}`);
    }
    assert.match(options, /show: false,/);
  });

  it('maximizes before the first show instead of showing a windowed frame first', async () => {
    const createWindowSource = await readCreateWindowSource();
    const handler = createWindowSource.match(
      /mainWindow\.once\('ready-to-show', \(\) => \{([\s\S]*?)\n {2}\}\);/,
    );
    assert.ok(handler, 'ready-to-show handler must be locatable');
    const body = handler[1];

    const maximizeIndex = body.indexOf('mainWindow?.maximize()');
    const activateIndex = body.indexOf("activateMainWindow('ready-to-show')");

    assert.ok(maximizeIndex >= 0, 'ready-to-show must maximize the window');
    assert.ok(activateIndex > maximizeIndex, 'activation (show + focus) must come after maximize');
    assert.equal(body.match(/activateMainWindow\(/g)?.length, 1, 'activation must happen exactly once');
  });
});
