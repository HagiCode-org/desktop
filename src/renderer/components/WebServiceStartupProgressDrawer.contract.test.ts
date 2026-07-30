import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');
const drawerPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStartupProgressDrawer.tsx');

describe('web service startup progress dialog contracts', () => {
  it('emits prelaunch startup phases before the managed process starts', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /emitWebServiceStartupPhase\(\s*StartupPhase\.CheckingVersion,/);
    assert.match(source, /emitWebServiceStartupPhase\(\s*StartupPhase\.CheckingDependencies,/);
    assert.match(source, /emitWebServiceStartupPhase\(StartupPhase\.Error, 'No active version found'\);/);
    assert.match(source, /webServiceManager\.syncExternalStartupPhase\(phase, message\);/);
  });

  it('opens a dedicated startup progress drawer from the homepage service card', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(source, /const \[showStartupProgressDrawer, setShowStartupProgressDrawer\] = useState\(false\);/);
    assert.match(source, /lastStartupPhaseRef\.current = StartupPhase\.CheckingVersion;/);
    assert.match(source, /setShowStartupProgressDrawer\(true\);/);
    assert.match(source, /<WebServiceStartupProgressDrawer/);
  });

  it('renders step-based progress content instead of a single loading sentence', async () => {
    const source = await fs.readFile(drawerPath, 'utf8');
    assert.match(source, /from '@\/components\/ui\/sheet'/);
    assert.match(source, /<Sheet open=\{open\} onOpenChange=\{onOpenChange\}>/);
    assert.match(source, /overflow-y-auto/);

    assert.match(source, /getStartupProgressSteps\(t\)/);
    assert.match(source, /webServiceStatus\.startupProgress\.currentStepLabel/);
    assert.match(source, /webServiceStatus\.startupProgress\.actions\.openFailureLog/);
    assert.match(source, /steps\.map\(\(step, index\) => \{/);
  });
});
