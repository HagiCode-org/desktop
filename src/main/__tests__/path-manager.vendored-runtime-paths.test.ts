import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  resolveVendoredRuntimeCurrentRootPath,
  resolveVendoredRuntimeVersionRootPath,
} from '../path-manager.js';

const cleanupRoots = new Set<string>();

afterEach(async () => {
  await Promise.all([...cleanupRoots].map(async (rootPath) => {
    cleanupRoots.delete(rootPath);
    await fs.rm(rootPath, { recursive: true, force: true });
  }));
});

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'path-manager-vendored-runtime-'));
  cleanupRoots.add(root);

  const runtimeDataHome = path.join(root, 'runtimeData');
  const serviceDataHome = path.join(runtimeDataHome, 'components', 'services', 'code-server');
  const packagedRoot = path.join(root, 'resources', 'components', 'bundled', 'code-server');

  await fs.mkdir(serviceDataHome, { recursive: true });
  await fs.mkdir(packagedRoot, { recursive: true });

  return {
    runtimeDataHome,
    serviceDataHome,
    packagedRoot,
  };
}

describe('vendored runtime extracted path resolution', () => {
  it('resolves code-server to the hagiscript-managed runtimeComponents layout when exact has not run yet', async () => {
    const fixture = await createFixture();
    await fs.writeFile(
      path.join(fixture.packagedRoot, '.hagicode-runtime.json'),
      JSON.stringify({ version: '2026.0523.0075' }),
      'utf8',
    );

    const versionRoot = resolveVendoredRuntimeVersionRootPath({
      ...fixture,
      serviceId: 'code-server',
    });
    const currentRoot = resolveVendoredRuntimeCurrentRootPath({
      ...fixture,
      serviceId: 'code-server',
    });

    assert.equal(
      versionRoot,
      path.join(fixture.runtimeDataHome, 'runtimeComponents', 'code_server', '2026.0523.0075'),
    );
    assert.equal(
      currentRoot,
      path.join(fixture.runtimeDataHome, 'runtimeComponents', 'code_server', '2026.0523.0075', 'current'),
    );
  });

  it('prefers the extracted-runtime state paths when they match the packaged version', async () => {
    const fixture = await createFixture();
    const versionedRoot = path.join(fixture.runtimeDataHome, 'runtimeComponents', 'code_server', '2026.0523.0075');
    const currentRoot = path.join(versionedRoot, 'current');

    await fs.writeFile(
      path.join(fixture.packagedRoot, '.hagicode-runtime.json'),
      JSON.stringify({ version: '2026.0523.0075' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(fixture.serviceDataHome, 'extracted-runtime.json'),
      JSON.stringify({
        version: '2026.0523.0075',
        versionedRoot,
        currentRoot,
      }),
      'utf8',
    );

    assert.equal(
      resolveVendoredRuntimeVersionRootPath({
        ...fixture,
        serviceId: 'code-server',
      }),
      versionedRoot,
    );
    assert.equal(
      resolveVendoredRuntimeCurrentRootPath({
        ...fixture,
        serviceId: 'code-server',
      }),
      currentRoot,
    );
  });

  it('ignores stale extracted-runtime state when the packaged version has advanced', async () => {
    const fixture = await createFixture();

    await fs.writeFile(
      path.join(fixture.packagedRoot, '.hagicode-runtime.json'),
      JSON.stringify({ version: '2026.0526.0080' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(fixture.serviceDataHome, 'extracted-runtime.json'),
      JSON.stringify({
        version: '2026.0523.0075',
        versionedRoot: path.join(fixture.runtimeDataHome, 'runtimeComponents', 'code_server', '2026.0523.0075'),
        currentRoot: path.join(fixture.runtimeDataHome, 'runtimeComponents', 'code_server', '2026.0523.0075', 'current'),
      }),
      'utf8',
    );

    assert.equal(
      resolveVendoredRuntimeCurrentRootPath({
        ...fixture,
        serviceId: 'code-server',
      }),
      path.join(fixture.runtimeDataHome, 'runtimeComponents', 'code_server', '2026.0526.0080', 'current'),
    );
  });
});
