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
});
