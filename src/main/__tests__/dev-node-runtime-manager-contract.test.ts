import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const devRuntimeManagerPath = path.resolve(process.cwd(), 'src/main/dev-node-runtime-manager.ts');
const dependencyManagerPath = path.resolve(process.cwd(), 'src/main/dependency-manager.ts');
const gitignorePath = path.resolve(process.cwd(), '.gitignore');
const packageJsonPath = path.resolve(process.cwd(), 'package.json');

describe('development node runtime manager contract', () => {
  it('validates metadata, executable probes, and governed version before reporting bundled-dev', async () => {
    const source = await fs.readFile(devRuntimeManagerPath, 'utf8');

    assert.match(source, /!app\.isPackaged/, 'development runtime is only considered in source mode');
    assert.match(source, /readPinnedNodeRuntimeConfig/, 'metadata validation uses governed runtime config');
    assert.match(source, /nodeVersionMatchesGovernedMajor\(metadata\.nodeVersion, this\.runtimeConfig\)/, 'governed major version mismatch is rejected');
    assert.match(source, /fsSync\.existsSync\(metadata\.nodeExecutablePath\)/, 'metadata is rejected when the referenced node binary is missing');
    assert.match(source, /isExecutable\(metadata\.nodeExecutablePath\)/, 'metadata is rejected when node is not executable');
    assert.match(source, /probeVersion\(metadata\.nodeExecutablePath, \['--version'\]\)/, 'node binary is probed before use');
    assert.match(source, /Node probe expected major/, 'node probe uses the governed major version');
    assert.match(source, /probeVersion\(metadata\.npmExecutablePath, \['--version'\]\)/, 'npm binary is probed before use');
    assert.match(source, /available: errors\.length === 0/, 'only error-free metadata is reported as available');
  });

  it('prefers bundled-dev node in source mode before packaged/system fallback', async () => {
    const source = await fs.readFile(dependencyManagerPath, 'utf8');

    assert.match(source, /new DevNodeRuntimeManager\(\)/, 'dependency detection constructs the dev runtime locator');
    assert.match(source, /checkDevNodeRuntimeDependency\(dep, componentId\)/, 'node and npm checks try the dev runtime before packaged lookup');
    assert.match(source, /resolutionSource: 'bundled-dev'/, 'valid dev runtime is reported as bundled-dev');
    assert.match(source, /const bundledStatus = await this\.bundledNodeRuntimeManager\.verify\(\)/, 'packaged bundled detection remains as fallback');
  });

  it('keeps generated runtime files ignored and exposes the package command', async () => {
    const [gitignore, packageJsonRaw] = await Promise.all([
      fs.readFile(gitignorePath, 'utf8'),
      fs.readFile(packageJsonPath, 'utf8'),
    ]);
    const packageJson = JSON.parse(packageJsonRaw) as { scripts: Record<string, string> };

    assert.match(gitignore, /^\.runtime\/node-dev\//m);
    assert.match(gitignore, /^build\/embedded-node-runtime\//m);
    assert.equal(packageJson.scripts['install:dev-node-runtime'], 'node scripts/install-dev-node-runtime.js');
  });
});
