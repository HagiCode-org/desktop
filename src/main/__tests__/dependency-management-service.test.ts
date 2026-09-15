import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolveCommandLaunch } from '../toolchain-launch.js';

const servicePath = path.resolve(process.cwd(), 'src/main/dependency-management-service.ts');

describe('dependency management service contract', () => {
  it('detects external Node/npm state without mutation or SDK sync code', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /private async detectExternalEnvironment\(\)/);
    assert.match(source, /source: 'externally-managed'/);
    assert.match(source, /resolveExternalNpmGlobalPrefix/);
    assert.match(source, /resolveExternalNpmGlobalModulesRoot/);
    assert.match(source, /resolveExternalNpmCacheRoot/);
  });

  it('keeps npm mirror settings opt-in', async () => {
    const source = await fs.readFile(servicePath, 'utf8');

    assert.match(source, /const DEFAULT_MIRROR_SETTINGS: NpmMirrorSettingsInput = \{\s*enabled: false,\s*\};/);
    assert.match(source, /return this\.normalizeMirrorSettings\(DEFAULT_MIRROR_SETTINGS\);/);
  });
});

describe('Windows command launch contract', () => {
  it('keeps .cmd wrappers on the shell-aware launch path for Program Files installs', () => {
    const launch = resolveCommandLaunch(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\npm.cmd',
      'win32',
    );

    assert.equal(launch.command, '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\HagiCode\\resources\\extra\\toolchain\\node\\npm.cmd"');
    assert.equal(launch.shell, true);
  });
});
