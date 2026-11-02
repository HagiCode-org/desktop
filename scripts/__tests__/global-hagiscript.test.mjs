import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveGlobalHagiscriptPackageRoot, resolvePackageRootFromShim } from '../global-hagiscript.js';

test('resolves HagiScript package root from its executable when npm prefix points elsewhere', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-global-hagiscript-'));
  const packageRoot = path.join(root, 'node_modules', '@hagicode', 'hagiscript');
  const binRoot = path.join(root, 'bin');
  const command = path.join(binRoot, 'hagiscript');
  const previous = {
    command: process.env.HAGICODE_HAGISCRIPT_COMMAND,
    packageRoot: process.env.HAGICODE_HAGISCRIPT_PACKAGE_ROOT,
    version: process.env.HAGICODE_HAGISCRIPT_VERSION,
  };

  try {
    await mkdir(path.join(packageRoot, 'dist'), { recursive: true });
    await mkdir(binRoot, { recursive: true });
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@hagicode/hagiscript' }));
    await writeFile(path.join(packageRoot, 'dist', 'cli.js'), '');
    await symlink(path.join(packageRoot, 'dist', 'cli.js'), command);
    process.env.HAGICODE_HAGISCRIPT_COMMAND = command;
    process.env.HAGICODE_HAGISCRIPT_PACKAGE_ROOT = '';
    process.env.HAGICODE_HAGISCRIPT_VERSION = '0.3.10';

    assert.equal(resolveGlobalHagiscriptPackageRoot('0.3.10'), packageRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries({
      HAGICODE_HAGISCRIPT_COMMAND: previous.command,
      HAGICODE_HAGISCRIPT_PACKAGE_ROOT: previous.packageRoot,
      HAGICODE_HAGISCRIPT_VERSION: previous.version,
    })) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('resolves HagiScript package root from a pnpm global shim', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-global-hagiscript-shim-'));
  const packageRoot = path.join(root, 'global', 'v11', 'abc', 'node_modules', '@hagicode', 'hagiscript');
  const binRoot = path.join(root, 'bin');
  const shim = path.join(binRoot, 'hagiscript');

  try {
    await mkdir(path.join(packageRoot, 'dist'), { recursive: true });
    await mkdir(binRoot, { recursive: true });
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@hagicode/hagiscript' }));
    await writeFile(
      shim,
      'basedir_abs=/x\nexec node "$basedir_abs/../global/v11/abc/node_modules/@hagicode/hagiscript/dist/cli.js" "$@"\n',
    );

    assert.equal(resolvePackageRootFromShim(shim), packageRoot);

    const cmdShim = path.join(binRoot, 'hagiscript.cmd');
    await writeFile(
      cmdShim,
      '@node "%dp0%\\..\\global\\v11\\abc\\node_modules\\@hagicode\\hagiscript\\dist\\cli.js" %*\r\n',
    );
    assert.equal(resolvePackageRootFromShim(cmdShim), packageRoot);
    assert.equal(resolvePackageRootFromShim(path.join(binRoot, 'missing')), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
