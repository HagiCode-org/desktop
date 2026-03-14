import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  evaluateRuntimeCompatibility,
  resolveAspNetCoreRuntimeRequirement,
  validateFrameworkDependentPayload,
} from '../embedded-runtime.js';
import type { Manifest } from '../manifest-reader.js';

const pathManagerSourcePath = path.resolve(process.cwd(), 'src/main/path-manager.ts');
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('embedded runtime support', () => {
  it('keeps path-manager helpers for packaged and development embedded runtime resolution', async () => {
    const source = await fs.readFile(pathManagerSourcePath, 'utf-8');

    assert.match(source, /getExpectedPackagedEmbeddedRuntimeRoot/);
    assert.match(source, /process\.resourcesPath, 'dotnet', platform/);
    assert.match(source, /getDevelopmentEmbeddedRuntimeRoot/);
    assert.match(source, /HAGICODE_EMBEDDED_DOTNET_ROOT/);
    assert.match(source, /getEmbeddedDotnetPath/);
  });

  it('derives the ASP.NET Core runtime requirement from runtimeconfig and manifest metadata', async () => {
    const installPath = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-runtime-'));
    tempDirectories.push(installPath);
    await fs.mkdir(path.join(installPath, 'lib'), { recursive: true });
    await fs.writeFile(path.join(installPath, 'lib', 'PCode.Web.dll'), 'placeholder', 'utf8');
    await fs.writeFile(path.join(installPath, 'lib', 'PCode.Web.deps.json'), '{}', 'utf8');
    await fs.writeFile(
      path.join(installPath, 'lib', 'PCode.Web.runtimeconfig.json'),
      JSON.stringify({
        runtimeOptions: {
          frameworks: [
            { name: 'Microsoft.NETCore.App', version: '10.0.0' },
            { name: 'Microsoft.AspNetCore.App', version: '10.0.0' },
          ],
        },
      }),
      'utf8',
    );

    const manifest: Manifest = {
      $schema: 'https://schema.hagicode.com/schemas/manifest/v1.schema.json',
      manifestVersion: '1.0',
      package: {
        name: 'hagicode',
        version: '0.0.0-test',
        buildTimestamp: '2026-03-14T00:00:00.000Z',
        gitCommit: 'test',
      },
      dependencies: {
        dotnet: {
          version: {
            min: '0.0.0',
            max: '99.0.0',
            description: '.NET runtime',
            runtime: {
              min: '10.0.0',
              max: '10.9.9',
              recommended: '10.0.1',
              description: 'ASP.NET Core 10 runtime',
            },
          },
          checkCommand: 'dotnet --version',
          type: 'system-runtime',
          description: '.NET runtime',
        },
      },
      filesReference: {
        path: '0.0.0-test.files.json',
        checksum: 'sha256:test',
        format: 'json',
        count: 3,
      },
      metadata: {
        description: 'test',
        author: 'test',
        license: 'AGPL-3.0',
        homepage: 'https://example.com',
        documentation: 'https://example.com/docs',
        repository: 'https://example.com/repo',
      },
    } as Manifest;

    const validation = await validateFrameworkDependentPayload(installPath, manifest);

    assert.equal(validation.startable, true);
    assert.deepEqual(validation.missingFiles, []);
    assert.equal(validation.requirement?.runtimeConfigVersion, '10.0.0');
    assert.equal(validation.requirement?.minimumVersion, '10.0.0');
    assert.equal(validation.requirement?.recommendedVersion, '10.0.1');
    assert.equal(validation.requirement?.label, '10.x');
  });

  it('flags incompatible bundled runtimes before startup', () => {
    const requirement = resolveAspNetCoreRuntimeRequirement('10.0.0', {
      min: '10.0.0',
      recommended: '10.0.0',
    });

    const compatibility = evaluateRuntimeCompatibility(requirement, '9.0.5');

    assert.equal(compatibility.compatible, false);
    assert.match(compatibility.reason || '', /requires ASP.NET Core 10\.x/);
    assert.equal(compatibility.embeddedVersion, '9.0.5');
  });
});
