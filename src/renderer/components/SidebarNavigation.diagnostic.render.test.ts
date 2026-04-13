import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');

describe('diagnostic primary navigation wiring', () => {
  it('keeps the diagnostic entry/page wiring while removing dashboard AI diagnosis entry points', async () => {
    const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
    const [sidebarSource, appSource, systemViewSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
      fs.readFile(systemManagementViewPath, 'utf8'),
    ]);

    assert.match(sidebarSource, /\{ id: 'diagnostic', labelKey: 'sidebar\.diagnostic', icon: Stethoscope \}/);
    assert.match(appSource, /import SystemDiagnosticPage from '\.\/components\/SystemDiagnosticPage';/);
    assert.match(appSource, /\{currentView === 'diagnostic' && <SystemDiagnosticPage \/>\}/);
    assert.equal(systemViewSource.includes('DiagnosisButton'), false);
    assert.equal(systemViewSource.includes(\"'diagnosis'\"), false);
  });
});
