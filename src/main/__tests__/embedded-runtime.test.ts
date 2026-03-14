import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  EMBEDDED_RUNTIME_METADATA_FILE,
  readPinnedRuntimeManifest,
  resolvePinnedRuntimeTarget,
} from '../embedded-runtime-config.js';
import {
  evaluateRuntimeCompatibility,
  resolveAspNetCoreRuntimeRequirement,
  validateFrameworkDependentPayload,
  validatePinnedEmbeddedRuntime,
  validateEmbeddedRuntimeLayout,
} from '../embedded-runtime.js';
import type { Manifest } from '../manifest-reader.js';

const pathManagerSourcePath = path.resolve(process.cwd(), 'src/main/path-manager.ts');
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

function buildManifest(): Manifest {
  return {
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
}

describe('embedded runtime support', () => {
  it('keeps path-manager helpers for packaged and development pinned runtime resolution', async () => {
    const source = await fs.readFile(pathManagerSourcePath, 'utf-8');

    assert.match(source, /getExpectedPackagedPinnedRuntimeRoot/);
    assert.match(source, /getDevelopmentPinnedRuntimeRoot/);
    assert.match(source, /getPinnedRuntimeRoot/);
    assert.match(source, /getPinnedDotnetPath/);
    assert.match(source, /HAGICODE_EMBEDDED_DOTNET_ROOT/);
  });

  it('derives the ASP.NET Core runtime requirement from runtimeconfig, manifest metadata, and pinned config', async () => {
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

    const validation = await validateFrameworkDependentPayload(installPath, buildManifest());
    const pinnedTarget = resolvePinnedRuntimeTarget(process.platform === 'win32' ? 'win-x64' : 'linux-x64');

    assert.equal(validation.startable, true);
    assert.deepEqual(validation.missingFiles, []);
    assert.equal(validation.requirement?.runtimeConfigVersion, '10.0.0');
    assert.equal(validation.requirement?.minimumVersion, '10.0.0');
    assert.equal(validation.requirement?.recommendedVersion, '10.0.1');
    assert.equal(validation.requirement?.pinnedVersion, pinnedTarget.aspNetCoreVersion);
    assert.equal(validation.requirement?.effectiveVersion, pinnedTarget.aspNetCoreVersion);
    assert.equal(validation.requirement?.effectiveLabel, pinnedTarget.aspNetCoreVersion);
    assert.equal(validation.requirement?.label, '10.x');
  });

  it('flags incompatible bundled runtimes before startup when the pinned version does not match', () => {
    const requirement = resolveAspNetCoreRuntimeRequirement('10.0.0', {
      min: '10.0.0',
      recommended: '10.0.0',
    }, '10.0.5');

    const compatibility = evaluateRuntimeCompatibility(requirement, '10.0.4');

    assert.equal(compatibility.compatible, false);
    assert.match(compatibility.reason || '', /requires ASP.NET Core >= 10\.0\.5/);
    assert.equal(compatibility.embeddedVersion, '10.0.4');
  });

  it('rejects incomplete framework-dependent payloads', async () => {
    const installPath = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-runtime-invalid-'));
    tempDirectories.push(installPath);
    await fs.mkdir(path.join(installPath, 'lib'), { recursive: true });
    await fs.writeFile(path.join(installPath, 'lib', 'PCode.Web.dll'), 'placeholder', 'utf8');

    const validation = await validateFrameworkDependentPayload(installPath, buildManifest());

    assert.equal(validation.startable, false);
    assert.deepEqual(validation.missingFiles.sort(), ['lib/PCode.Web.deps.json', 'lib/PCode.Web.runtimeconfig.json']);
    assert.match(validation.message || '', /Missing framework-dependent payload files/);
  });

  it('validates pinned runtime metadata for staged payloads', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pinned-runtime-'));
    tempDirectories.push(runtimeRoot);

    const manifest = readPinnedRuntimeManifest();
    const target = resolvePinnedRuntimeTarget('linux-x64');

    await fs.mkdir(path.join(runtimeRoot, 'host', 'fxr', target.hostFxrVersion), { recursive: true });
    await fs.mkdir(path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App', target.netCoreVersion), { recursive: true });
    await fs.mkdir(path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App', target.aspNetCoreVersion), { recursive: true });
    await fs.writeFile(path.join(runtimeRoot, 'dotnet'), 'placeholder', 'utf8');
    await fs.writeFile(
      path.join(runtimeRoot, EMBEDDED_RUNTIME_METADATA_FILE),
      JSON.stringify({
        schemaVersion: 1,
        platform: 'linux-x64',
        provider: manifest.source.provider,
        releaseMetadataUrl: manifest.source.releaseMetadataUrl,
        allowedDownloadHosts: manifest.source.allowedDownloadHosts,
        releaseVersion: manifest.releaseVersion,
        releaseDate: manifest.releaseDate,
        downloadUrl: target.downloadUrl,
        sourceHost: 'builds.dotnet.microsoft.com',
        archiveType: target.archiveType,
        dotnetPath: path.join(runtimeRoot, 'dotnet'),
        runtimeRoot,
        aspNetCoreVersion: target.aspNetCoreVersion,
        netCoreVersion: target.netCoreVersion,
        hostFxrVersion: target.hostFxrVersion,
        stagedAt: '2026-03-14T00:00:00.000Z',
      }),
      'utf8',
    );

    const runtimeValidation = await validateEmbeddedRuntimeLayout(runtimeRoot, 'dotnet');
    const pinnedValidation = await validatePinnedEmbeddedRuntime('linux-x64', runtimeValidation);

    assert.equal(runtimeValidation.valid, true);
    assert.equal(pinnedValidation.valid, true);
  });
});
