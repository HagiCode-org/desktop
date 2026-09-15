import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const managerPath = path.resolve(process.cwd(), 'src/main/system-diagnostic-manager.ts');

describe('system-diagnostic-manager external runtime reporting', () => {
  it('probes the full desktop agent CLI catalog', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /desktopAgentCliCatalog\.map/);
    assert.match(source, /this\.probeAgentCli\(definition, runtimeEnv, issues\)/);
  });

  it('collects .NET, external Node.js, npm, and npm configuration diagnostics', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /this\.collectDotnetRuntimeRow\(runtimeEnv, issues\)/);
    assert.match(source, /this\.probeExternalRuntimeCommand\('node', runtimeEnv, issues\)/);
    assert.match(source, /this\.probeExternalRuntimeCommand\('npm', runtimeEnv, issues\)/);
    assert.match(source, /this\.collectNpmConfigInfo\(runtimeEnv, issues\)/);
    assert.match(source, /source: 'external'/);
    assert.match(source, /npm\.globalBinRoot/);
    assert.match(source, /npm\.globalModulesRoot/);
  });

  it('keeps external runtime failures scoped to the relevant diagnostic sections', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /this\.pushIssue\(issues, 'builtin-runtime', command, 'missing'/);
    assert.match(source, /this\.pushIssue\(issues, 'builtin-runtime', command, 'error'/);
    assert.match(source, /this\.pushIssue\(issues, 'npm-config', 'registry', 'error'/);
    assert.match(source, /this\.pushIssue\(issues, 'toolchain', toolchainProbe\.command, 'missing'/);
    assert.doesNotMatch(source, /bundledToolchain/);
  });
});
