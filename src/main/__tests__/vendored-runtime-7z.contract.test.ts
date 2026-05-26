import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { path7za } from '7zip-bin';

const sourcePath = path.resolve(process.cwd(), 'src/main/vendored-runtime-7z.ts');
const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const sevenZipPackageJsonPath = path.resolve(process.cwd(), 'node_modules', '7zip-bin', 'package.json');

describe('Desktop-owned 7z extractor contract', () => {
  it('uses the bundled 7zip-bin dependency instead of host-provided 7z tooling', async () => {
    const [source, packageJsonRaw, sevenZipPackageJsonRaw] = await Promise.all([
      fsp.readFile(sourcePath, 'utf8'),
      fsp.readFile(packageJsonPath, 'utf8'),
      fsp.readFile(sevenZipPackageJsonPath, 'utf8'),
    ]);
    const packageJson = JSON.parse(packageJsonRaw) as { dependencies?: Record<string, string> };
    const sevenZipPackageJson = JSON.parse(sevenZipPackageJsonRaw) as { files?: string[] };

    assert.equal(packageJson.dependencies?.['7zip-bin'], '~5.2.0');
    assert.equal(Array.isArray(sevenZipPackageJson.files), true);
    assert.deepEqual(sevenZipPackageJson.files?.filter((entry) => ['linux', 'mac', 'win'].includes(entry)).sort(), ['linux', 'mac', 'win']);
    assert.match(source, /import { path7za } from '7zip-bin'/);
    assert.match(source, /return path7za/);
    assert.equal(source.includes("command: resolveDesktopOwned7zExecutablePath(),"), true);
    assert.equal(source.includes("args: ['x', options.archivePath, `-o${options.destinationDir}`, '-y', '-bb0']"), true);
    assert.match(source, /shell: false/);
    assert.match(source, /windowsHide: true/);
    assert.equal(source.includes("spawn('7z'"), false);
    assert.equal(source.includes("execFile('7z'"), false);
    assert.equal(source.includes('which 7z'), false);
  });

  it('ships an existing Desktop-owned extractor binary on the current platform', () => {
    assert.equal(path.isAbsolute(path7za), true);
    assert.equal(fs.existsSync(path7za), true);
  });
});
