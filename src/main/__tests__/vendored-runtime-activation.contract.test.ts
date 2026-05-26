import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import { path7za } from '7zip-bin';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
} from '../code-server-runtime.js';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
} from '../omniroute-runtime.js';
import {
  clearVendoredRuntimeActivationProgress,
} from '../vendored-runtime-activation-state.js';
import {
  VendoredRuntimeActivationService,
} from '../vendored-runtime-activation.js';
import type { VendoredRuntimeId } from '../../types/dependency-management.js';

const execFileAsync = promisify(execFile);
const cleanupRoots = new Set<string>();

afterEach(async () => {
  clearVendoredRuntimeActivationProgress('code-server');
  clearVendoredRuntimeActivationProgress('omniroute');
  await Promise.all([...cleanupRoots].map(async (rootPath) => {
    cleanupRoots.delete(rootPath);
    await fs.rm(rootPath, { recursive: true, force: true });
  }));
});

function createLayout(baseRoot: string) {
  const programHome = path.join(baseRoot, 'resources', 'extra', 'runtime');
  const runtimeDataHome = path.join(baseRoot, 'userData', 'runtimeData');

  return {
    codeServer: {
      packagedRoot: path.join(programHome, 'components', 'bundled', 'code-server'),
      packagedArchivePath: path.join(programHome, 'components', 'bundled', 'code-server', 'archives', 'code-server.7z'),
      runtimeHome: path.join(runtimeDataHome, 'components', 'services', 'code-server', 'runtime'),
      currentRoot: path.join(runtimeDataHome, 'components', 'services', 'code-server', 'runtime', 'current'),
      stagingRoot: path.join(runtimeDataHome, 'components', 'services', 'code-server', 'runtime', 'staging'),
    },
    omniRoute: {
      packagedRoot: path.join(programHome, 'components', 'bundled', 'omniroute'),
      packagedArchivePath: path.join(programHome, 'components', 'bundled', 'omniroute', 'archives', 'omniroute.7z'),
      runtimeHome: path.join(runtimeDataHome, 'components', 'services', 'omniroute', 'runtime'),
      currentRoot: path.join(runtimeDataHome, 'components', 'services', 'omniroute', 'runtime', 'current'),
      stagingRoot: path.join(runtimeDataHome, 'components', 'services', 'omniroute', 'runtime', 'staging'),
    },
  };
}

function createFakePathManager(layout: ReturnType<typeof createLayout>) {
  return {
    getCodeServerPackagedRuntimeRoot: () => layout.codeServer.packagedRoot,
    getCodeServerPackagedArchivePath: () => layout.codeServer.packagedArchivePath,
    getCodeServerRuntimeHome: () => layout.codeServer.runtimeHome,
    getCodeServerRuntimeRoot: () => layout.codeServer.currentRoot,
    getCodeServerRuntimeStagingRoot: () => layout.codeServer.stagingRoot,
    getOmniRoutePackagedRuntimeRoot: () => layout.omniRoute.packagedRoot,
    getOmniRoutePackagedArchivePath: () => layout.omniRoute.packagedArchivePath,
    getOmniRouteRuntimeHome: () => layout.omniRoute.runtimeHome,
    getOmniRouteRuntimeRoot: () => layout.omniRoute.currentRoot,
    getOmniRouteRuntimeStagingRoot: () => layout.omniRoute.stagingRoot,
  };
}

async function createArchive(archivePath: string, sourceRoot: string, entries: string[]): Promise<void> {
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await execFileAsync(path7za, ['a', archivePath, ...entries], { cwd: sourceRoot });
}

async function createPackagedRuntimeFixture(input: {
  runtimeId: VendoredRuntimeId;
  packagedRoot: string;
  archivePath: string;
  version: string;
  schemaVersion: number;
  packageId: string;
  bundledNodeRuntime: boolean;
  archiveIncludesLegacyMetadata?: boolean;
  archiveRootSubdir?: string;
}): Promise<void> {
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${input.runtimeId}-payload-`));
  cleanupRoots.add(sourceRoot);

  const metadata = {
    schemaVersion: input.schemaVersion,
    packageId: input.packageId,
    version: input.version,
    platform: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
    arch: process.arch === 'arm64' ? 'arm64' : 'amd64',
    sourceRevision: 'test-fixture',
    extra: {
      bundledNodeRuntime: input.bundledNodeRuntime,
    },
  };

  const archiveIncludesLegacyMetadata = input.archiveIncludesLegacyMetadata ?? true;
  const payloadRoot = input.archiveRootSubdir
    ? path.join(sourceRoot, input.archiveRootSubdir)
    : sourceRoot;
  const archiveEntry = (relativePath: string) => input.archiveRootSubdir
    ? path.posix.join(input.archiveRootSubdir, relativePath).replace(/\\/g, '/')
    : relativePath;

  await fs.mkdir(path.join(payloadRoot, 'bin'), { recursive: true });
  if (archiveIncludesLegacyMetadata) {
    await fs.writeFile(path.join(payloadRoot, 'metadata.json'), JSON.stringify(metadata, null, 2));
  }

  if (input.runtimeId === 'code-server') {
    await fs.mkdir(path.join(payloadRoot, 'out', 'node'), { recursive: true });
    await fs.writeFile(path.join(payloadRoot, 'bin', 'code-server'), '#!/usr/bin/env bash\necho code-server\n');
    await fs.writeFile(path.join(payloadRoot, 'out', 'node', 'entry.js'), 'console.log("code-server");\n');
    await createArchive(
      input.archivePath,
      sourceRoot,
      archiveIncludesLegacyMetadata
        ? [archiveEntry('metadata.json'), archiveEntry('bin'), archiveEntry('out')]
        : [archiveEntry('bin'), archiveEntry('out')],
    );
  } else {
    await fs.writeFile(path.join(payloadRoot, 'bin', 'omniroute'), '#!/usr/bin/env bash\necho omniroute\n');
    await fs.writeFile(path.join(payloadRoot, 'bin', 'omniroute.mjs'), 'console.log("omniroute");\n');
    await createArchive(
      input.archivePath,
      sourceRoot,
      archiveIncludesLegacyMetadata
        ? [archiveEntry('metadata.json'), archiveEntry('bin')]
        : [archiveEntry('bin')],
    );
  }

  await fs.mkdir(input.packagedRoot, { recursive: true });
  await fs.writeFile(
    path.join(input.packagedRoot, '.hagicode-runtime.json'),
    JSON.stringify({
      schemaVersion: input.schemaVersion,
      packageId: input.packageId,
      version: input.version,
      archiveFormat: '7z',
      vendoredAssetName: path.basename(input.archivePath),
      vendoredReleaseTag: `v${input.version}`,
      generatedAt: '2026-05-26T00:00:00.000Z',
    }, null, 2),
  );
}

async function createBaseLayout(): Promise<ReturnType<typeof createLayout>> {
  const baseRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vendored-runtime-activation-'));
  cleanupRoots.add(baseRoot);
  return createLayout(baseRoot);
}

describe('vendored runtime activation service', () => {
  it('deduplicates concurrent activation requests per runtime', async () => {
    const layout = await createBaseLayout();
    const service = new VendoredRuntimeActivationService(createFakePathManager(layout) as any);
    const pendingResult = {
      success: false,
      status: { runtimeId: 'code-server' } as any,
      error: 'pending-test',
    };

    let resolvePending!: (value: typeof pendingResult) => void;
    let runCount = 0;
    (service as any).runActivation = () => new Promise((resolve) => {
      runCount += 1;
      resolvePending = resolve as (value: typeof pendingResult) => void;
    });

    const first = service.activate('code-server');
    const second = service.activate('code-server');
    assert.equal(runCount, 1);

    resolvePending(pendingResult);
    const [result, secondResult] = await Promise.all([first, second]);
    assert.deepEqual(secondResult, result);
    assert.equal(result.error, 'pending-test');

    (service as any).runActivation = async () => ({
      success: false,
      status: { runtimeId: 'code-server' } as any,
      error: 'second-pass',
    });

    const third = service.activate('code-server');
    const thirdResult = await third;
    assert.equal(runCount, 1);
    assert.equal(thirdResult.error, 'second-pass');
  });

  it('activates vendored code-server into the Desktop-owned userData runtime root', async () => {
    const layout = await createBaseLayout();
    const config = readCodeServerRuntimeConfig();
    const version = config.releaseVersionByPlatform?.[detectCodeServerRuntimePlatform()] ?? config.releaseVersion ?? '0.0.0';

    await createPackagedRuntimeFixture({
      runtimeId: 'code-server',
      packagedRoot: layout.codeServer.packagedRoot,
      archivePath: layout.codeServer.packagedArchivePath,
      version,
      schemaVersion: config.schemaVersion,
      packageId: config.packageId,
      bundledNodeRuntime: false,
      archiveIncludesLegacyMetadata: false,
    });

    const service = new VendoredRuntimeActivationService(createFakePathManager(layout) as any);
    const result = await service.activate('code-server');

    assert.equal(result.success, true);
    assert.equal(result.status.installStatus, 'installed');
    assert.equal(result.status.sourceStatus, 'available');
    assert.equal(result.status.runtimeRoot, layout.codeServer.currentRoot);
    assert.match(result.status.runtimeRoot, /components\/services\/code-server\/runtime\/current$/);
    assert.equal(result.status.packagedArchivePath, layout.codeServer.packagedArchivePath);
    assert.equal(Boolean(result.status.wrapperPath), true);
    assert.equal(Boolean(result.status.entryScriptPath), true);
    await fs.access(path.join(layout.codeServer.runtimeHome, '.hagicode-runtime.json'));
  });

  it('activates vendored code-server when the archive is wrapped in a release directory', async () => {
    const layout = await createBaseLayout();
    const config = readCodeServerRuntimeConfig();
    const version = config.releaseVersionByPlatform?.[detectCodeServerRuntimePlatform()] ?? config.releaseVersion ?? '0.0.0';

    await createPackagedRuntimeFixture({
      runtimeId: 'code-server',
      packagedRoot: layout.codeServer.packagedRoot,
      archivePath: layout.codeServer.packagedArchivePath,
      version,
      schemaVersion: config.schemaVersion,
      packageId: config.packageId,
      bundledNodeRuntime: false,
      archiveIncludesLegacyMetadata: false,
      archiveRootSubdir: 'release',
    });

    const service = new VendoredRuntimeActivationService(createFakePathManager(layout) as any);
    const result = await service.activate('code-server');

    assert.equal(result.success, true);
    assert.equal(result.status.installStatus, 'installed');
    assert.equal(result.status.runtimeRoot, layout.codeServer.currentRoot);
    await fs.access(path.join(layout.codeServer.currentRoot, 'bin', 'code-server'));
    await fs.access(path.join(layout.codeServer.currentRoot, 'out', 'node', 'entry.js'));
  });

  it('activates vendored OmniRoute into the Desktop-owned userData runtime root', async () => {
    const layout = await createBaseLayout();
    const config = readOmniRouteRuntimeConfig();
    const version = config.releaseVersionByPlatform?.[detectOmniRouteRuntimePlatform()] ?? config.releaseVersion ?? '0.0.0';

    await createPackagedRuntimeFixture({
      runtimeId: 'omniroute',
      packagedRoot: layout.omniRoute.packagedRoot,
      archivePath: layout.omniRoute.packagedArchivePath,
      version,
      schemaVersion: config.schemaVersion,
      packageId: config.packageId,
      bundledNodeRuntime: true,
      archiveIncludesLegacyMetadata: false,
    });

    const service = new VendoredRuntimeActivationService(createFakePathManager(layout) as any);
    const result = await service.activate('omniroute');

    assert.equal(result.success, true);
    assert.equal(result.status.installStatus, 'installed');
    assert.equal(result.status.sourceStatus, 'available');
    assert.equal(result.status.runtimeRoot, layout.omniRoute.currentRoot);
    assert.match(result.status.runtimeRoot, /components\/services\/omniroute\/runtime\/current$/);
    assert.equal(result.status.packagedArchivePath, layout.omniRoute.packagedArchivePath);
    assert.equal(Boolean(result.status.wrapperPath), true);
    assert.equal(Boolean(result.status.entryScriptPath), true);
    await fs.access(path.join(layout.omniRoute.runtimeHome, '.hagicode-runtime.json'));
  });

  it('returns a damaged snapshot when the packaged archive contract is invalid', async () => {
    const layout = await createBaseLayout();
    await fs.mkdir(layout.codeServer.packagedRoot, { recursive: true });
    await fs.writeFile(
      path.join(layout.codeServer.packagedRoot, '.hagicode-runtime.json'),
      JSON.stringify({
        schemaVersion: 1,
        packageId: 'code-server',
        version: '0.0.0',
        archiveFormat: 'zip',
        vendoredAssetName: 'code-server.zip',
      }, null, 2),
    );

    const service = new VendoredRuntimeActivationService(createFakePathManager(layout) as any);
    const result = await service.activate('code-server');

    assert.equal(result.success, false);
    assert.equal(result.status.status, 'damaged');
    assert.equal(result.status.sourceStatus, 'invalid');
    assert.equal(result.status.installStatus, 'failed');
    assert.match((result.error ?? result.status.diagnostics[0] ?? ''), /Packaged runtime marker|Packaged vendored runtime archive is missing|Packaged vendored runtime source is unavailable/);
  });
});
