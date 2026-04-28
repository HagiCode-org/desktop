import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const systemDiagnosticManagerPath = path.resolve(process.cwd(), 'src/main/system-diagnostic-manager.ts');

describe('system-diagnostic-manager bundled toolchain reporting', () => {
  it('reports manifest-declared commands and deferred package metadata in the diagnostic report', async () => {
    const source = await fs.readFile(systemDiagnosticManagerPath, 'utf8');

    assert.match(source, /Object\.entries\(status\.manifest\?\.commands \?\? {}\)/);
    assert.match(source, /Object\.entries\(status\.manifest\?\.packages \?\? {}\)/);
    assert.match(source, /`activeForDesktop=\$\{data\.bundledToolchain\.activeForDesktop\}`/);
    assert.match(source, /`activationSource=\$\{data\.bundledToolchain\.activationSource\}`/);
    assert.match(source, /`package\.\$\{name\}\.name=\$\{packageRecord\.packageName\}`/);
    assert.match(source, /`package\.\$\{name\}\.version=\$\{packageRecord\.version \?\? 'unknown'\}`/);
    assert.match(source, /`coverage\.requiredByCoreRuntime=\$\{AUDITED_CORE_DEPENDENCY_COVERAGE_MATRIX\.requiredCommands\.join\(','\)\}`/);
  });

  it('probes the full desktop agent cli catalog instead of only npm-managed packages', async () => {
    const source = await fs.readFile(systemDiagnosticManagerPath, 'utf8');

    assert.match(source, /desktopAgentCliCatalog\.map/);
    assert.match(source, /copilot: \[\['--version'\], \['version'\], \['-v'\]\]/);
    assert.match(source, /'kiro-cli': \[\['--version'\], \['version'\], \['-v'\]\]/);
    assert.match(source, /kimi: \[\['--version'\], \['version'\], \['-v'\]\]/);
    assert.match(source, /deepagents: \[\['--version'\], \['version'\], \['-v'\]\]/);
    assert.match(source, /hermes: \[\['--version'\], \['version'\], \['-v'\]\]/);
    assert.match(source, /const commandCandidates = \[\.\.\.definition\.commandCandidates\]/);
  });

  it('collects built-in Node.js, npm config, and managed command diagnostics', async () => {
    const source = await fs.readFile(systemDiagnosticManagerPath, 'utf8');

    assert.match(source, /builtinRuntimes = await this\.collectBuiltinRuntimeDiagnostics/);
    assert.match(source, /probeBundledRuntimeCommand\('node'/);
    assert.match(source, /probeBundledRuntimeCommand\('npm'/);
    assert.match(source, /probeBundledRuntimeCommand\('npx'/);
    assert.match(source, /\['config', 'get', 'registry'\]/);
    assert.match(source, /HAGICODE_NPM_GLOBAL_PREFIX/);
    assert.match(source, /npm\.globalBinRoot/);
    assert.match(source, /npm\.globalModulesRoot/);
    assert.match(source, /npm\.bundledRuntimeRoot/);
    assert.match(source, /managed\.\$\{command\.id\}\.status=\$\{command\.status\}/);
    assert.match(source, /pushSection\('built-in-runtimes'/);
  });

  it('keeps runtime diagnostics scoped when bundled Node validation or npm config probes fail', async () => {
    const source = await fs.readFile(systemDiagnosticManagerPath, 'utf8');

    assert.match(source, /safeCollectBundledToolchainStatus/);
    assert.match(source, /this\.pushIssue\(issues, 'bundled-runtime', 'node-verify', 'error'/);
    assert.match(source, /this\.pushIssue\(issues, 'npm-config', 'registry', 'error'/);
    assert.match(source, /this\.pushIssue\(issues, 'npm-config', key, 'error'/);
    assert.match(source, /this\.pushIssue\(issues, 'managed-command', id, 'missing'/);
  });
});
