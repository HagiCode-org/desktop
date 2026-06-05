import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');
const dialogPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStartupProgressDialog.tsx');

describe('web service startup progress dialog contracts', () => {
  it('emits prelaunch startup phases before the managed process starts', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /emitWebServiceStartupPhase\(\s*StartupPhase\.CheckingVersion,/);
    assert.match(source, /emitWebServiceStartupPhase\(\s*StartupPhase\.CheckingDependencies,/);
    assert.match(source, /emitWebServiceStartupPhase\(StartupPhase\.Error, 'No active version found'\);/);
  });

  it('opens a dedicated startup progress dialog from the homepage service card', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /const \[showStartupProgressDialog, setShowStartupProgressDialog\] = useState\(false\);/);
    assert.match(source, /lastStartupPhaseRef\.current = StartupPhase\.CheckingVersion;/);
    assert.match(source, /setShowStartupProgressDialog\(true\);/);
    assert.match(source, /<WebServiceStartupProgressDialog/);
  });

  it('renders step-based progress content instead of a single loading sentence', async () => {
    const source = await fs.readFile(dialogPath, 'utf8');

    assert.match(source, /getStartupProgressSteps\(t\)/);
    assert.match(source, /webServiceStatus\.startupProgress\.currentStepLabel/);
    assert.match(source, /webServiceStatus\.startupProgress\.actions\.openFailureLog/);
    assert.match(source, /steps\.map\(\(step, index\) => \{/);
  });
});
