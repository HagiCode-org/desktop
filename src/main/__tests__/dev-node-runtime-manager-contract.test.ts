import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const devRuntimeManagerPath = path.resolve(process.cwd(), 'src/main/dev-node-runtime-manager.ts');
const dependencyManagerPath = path.resolve(process.cwd(), 'src/main/dependency-manager.ts');
const webServiceManagerPath = path.resolve(process.cwd(), 'src/main/web-service-manager.ts');
const portableToolchainEnvPath = path.resolve(process.cwd(), 'src/main/portable-toolchain-env.ts');
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
    const [source, webServiceSource, portableToolchainEnvSource] = await Promise.all([
      fs.readFile(dependencyManagerPath, 'utf8'),
      fs.readFile(webServiceManagerPath, 'utf8'),
      fs.readFile(portableToolchainEnvPath, 'utf8'),
    ]);

    assert.doesNotMatch(source, /DevNodeRuntimeManager/, 'dependency detection no longer constructs a dev runtime locator');
    assert.doesNotMatch(source, /checkDevNodeRuntimeDependency/, 'node and npm checks no longer use a source-only runtime');
    assert.doesNotMatch(source, /bundled-dev/, 'dependency results no longer report bundled-dev');
    assert.match(source, /const bundledStatus = await this\.bundledNodeRuntimeManager\.verify\(\)/, 'dependency detection uses the bundled portable toolchain');
    assert.doesNotMatch(webServiceSource, /HAGICODE_DEV_NODE_RUNTIME_ROOT/, 'service startup no longer injects the dev runtime marker');
    assert.match(portableToolchainEnvSource, /export function injectManagedCliPathEnv/, 'portable toolchain env exposes the managed Agent CLI path helper');
    assert.match(portableToolchainEnvSource, /HAGICODE_AGENT_CLI_PATH/, 'portable toolchain env exposes the managed Agent CLI path instead of mutating PATH with Node runtime roots');
    assert.match(portableToolchainEnvSource, /HAGICODE_NPM_GLOBAL_PATH/, 'portable toolchain env also exposes the Desktop-managed npm global prefix for runtime package resolution');
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
    assert.equal(
      packageJson.scripts.predev,
      'cross-env HAGICODE_DESKTOP_INSTANCE_NAME=hagicode_dev npm run prepare:runtime:optional && cross-env HAGICODE_DESKTOP_INSTANCE_NAME=hagicode_dev npm run prepare:bundled-toolchain:optional',
    );
  });
});
