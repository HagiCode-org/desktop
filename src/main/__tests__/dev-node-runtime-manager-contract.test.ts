import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const devRuntimeManagerPath = path.resolve(process.cwd(), 'src/main/dev-node-runtime-manager.ts');
const dependencyManagerPath = path.resolve(process.cwd(), 'src/main/dependency-manager.ts');
const webServiceManagerPath = path.resolve(process.cwd(), 'src/main/web-service-manager.ts');
const gitignorePath = path.resolve(process.cwd(), '.gitignore');
const packageJsonPath = path.resolve(process.cwd(), 'package.json');

describe('source mode bundled node runtime contract', () => {
  it('removes the source-tree .runtime/node-dev runtime manager', async () => {
    await assert.rejects(
      fs.access(devRuntimeManagerPath),
      /ENOENT/,
      'source mode no longer has a separate development Node runtime manager',
    );
  });

  it('uses the portable-fixed bundled toolchain for dependency detection and web service startup', async () => {
    const source = await fs.readFile(dependencyManagerPath, 'utf8');
    const webServiceSource = await fs.readFile(webServiceManagerPath, 'utf8');

    assert.doesNotMatch(source, /DevNodeRuntimeManager/, 'dependency detection no longer constructs a dev runtime locator');
    assert.doesNotMatch(source, /checkDevNodeRuntimeDependency/, 'node and npm checks no longer use a source-only runtime');
    assert.doesNotMatch(source, /bundled-dev/, 'dependency results no longer report bundled-dev');
    assert.match(source, /const bundledStatus = await this\.bundledNodeRuntimeManager\.verify\(\)/, 'dependency detection uses the bundled portable toolchain');
    assert.doesNotMatch(webServiceSource, /HAGICODE_DEV_NODE_RUNTIME_ROOT/, 'service startup no longer injects the dev runtime marker');
    assert.match(webServiceSource, /toolchainEnv\.usedBundledToolchain\s*\?\s*this\.pathManager\.getPortableNodeRoot\(\)/, 'service startup selects the portable Node root when the bundled toolchain is active');
  });

  it('removes generated .runtime ignore rules and the dev runtime package command', async () => {
    const [gitignore, packageJsonRaw] = await Promise.all([
      fs.readFile(gitignorePath, 'utf8'),
      fs.readFile(packageJsonPath, 'utf8'),
    ]);
    const packageJson = JSON.parse(packageJsonRaw) as { scripts: Record<string, string> };

    assert.doesNotMatch(gitignore, /^\.runtime\/node-dev\//m);
    assert.match(gitignore, /^build\/embedded-node-runtime\//m);
    assert.equal(packageJson.scripts['install:dev-node-runtime'], undefined);
    assert.equal(packageJson.scripts.predev, 'npm run prepare:bundled-toolchain:optional');
  });
});
