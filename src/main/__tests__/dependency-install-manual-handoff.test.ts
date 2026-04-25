import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const dependencyManagerPath = path.resolve(process.cwd(), 'src/main/dependency-manager.ts');
const mainProcessPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('dependency install manual handoff contract', () => {
  it('keeps legacy install entrypoints as manual-handoff placeholders', async () => {
    const [dependencyManagerSource, mainProcessSource] = await Promise.all([
      fs.readFile(dependencyManagerPath, 'utf8'),
      fs.readFile(mainProcessPath, 'utf8'),
    ]);

    assert.match(dependencyManagerSource, /MANUAL_DEPENDENCY_HANDOFF_MESSAGE/);
    assert.match(dependencyManagerSource, /Desktop no longer executes dependency installers automatically/);
    assert.equal(dependencyManagerSource.includes('Installation now handled by AI'), false);
    assert.match(mainProcessSource, /status: 'manual-action-required'/);
    assert.match(mainProcessSource, /buildManualActionPlan\(checkedDependencies\)/);
    assert.equal(mainProcessSource.includes('dependencyManager.installFromManifest('), false);
    assert.equal(mainProcessSource.includes('dependencyManager.installSingleDependency('), false);
    assert.equal(mainProcessSource.includes('handled by AI'), false);
  });
});
