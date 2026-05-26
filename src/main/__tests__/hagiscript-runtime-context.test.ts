import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { HagiscriptRuntimeContextResolver } from '../hagiscript-runtime-context.js';

const cleanupRoots = new Set<string>();

afterEach(async () => {
  await Promise.all([...cleanupRoots].map(async (rootPath) => {
    cleanupRoots.delete(rootPath);
    await fs.rm(rootPath, { recursive: true, force: true });
  }));
});

describe('hagiscript runtime context resolver', () => {
  it('aliases bundled launch scripts that live under userData paths with spaces', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagiscript-runtime-context-'));
    cleanupRoots.add(root);

    const runtimeHome = path.join(root, 'Hagi Code resources');
    const runtimeDataRoot = path.join(root, 'Hagi Code userData', 'runtimeData');
    const runtimeRoot = path.join(root, 'Hagi Code userData');
    const serverProgramRoot = path.join(root, 'Hagi Code managed server');
    const serverDataRoot = path.join(root, 'Hagi Code managed data');
    const omnirouteDataHome = path.join(runtimeDataRoot, 'components', 'services', 'omniroute');
    const omnirouteRuntimeRoot = path.join(omnirouteDataHome, 'runtime', 'current');
    const launchScriptPath = path.join(omnirouteRuntimeRoot, 'omniroute.sh');
    const dotnetRuntimeRoot = path.join(runtimeHome, 'components', 'dotnet', 'runtime', 'linux-x64');

    await Promise.all([
      fs.mkdir(omnirouteRuntimeRoot, { recursive: true }),
      fs.mkdir(dotnetRuntimeRoot, { recursive: true }),
      fs.mkdir(serverProgramRoot, { recursive: true }),
      fs.mkdir(serverDataRoot, { recursive: true }),
      fs.mkdir(path.join(root, 'Hagi Code npm'), { recursive: true }),
    ]);
    await fs.writeFile(launchScriptPath, '#!/usr/bin/env bash\necho omniroute\n', 'utf8');

    const resolver = new HagiscriptRuntimeContextResolver({
      pathManager: {
        getRuntimeProgramHome: () => runtimeHome,
        getRuntimeDataHome: () => runtimeDataRoot,
        getUserDataPath: () => runtimeRoot,
        getManagedServerProgramHome: () => serverProgramRoot,
        getManagedServerDataHome: () => serverDataRoot,
        getCodeServerRuntimeDataHome: () => path.join(runtimeDataRoot, 'components', 'services', 'code-server'),
        getCodeServerRuntimeRoot: () => path.join(runtimeDataRoot, 'components', 'services', 'code-server', 'runtime', 'current'),
        getOmniRouteRuntimeDataHome: () => omnirouteDataHome,
        getOmniRouteRuntimeRoot: () => omnirouteRuntimeRoot,
        getEmbeddedRuntimeContainerRoot: () => dotnetRuntimeRoot,
        getEmbeddedRuntimeRoot: () => dotnetRuntimeRoot,
        getCurrentPlatform: () => 'linux-x64',
      } as any,
      dependencyManagementService: {
        async getManagedCommandContext() {
          return {
            packageStatus: {
              status: 'installed',
              packageRoot: path.join(root, 'Hagi Code npm', 'lib', 'node_modules', '@hagicode', 'hagiscript'),
              version: '0.9.0',
            },
            executablePath: path.join(root, 'Hagi Code npm', 'bin', 'hagiscript'),
            environment: {
              npmGlobalPrefix: path.join(root, 'Hagi Code npm'),
            },
            commandEnv: {},
          };
        },
      } as any,
    });

    const context = await resolver.resolveBundledRuntime({
      service: 'omniroute',
      launchScriptPath,
      launchWorkingDirectory: omnirouteRuntimeRoot,
      launchArgs: ['--no-open'],
      serviceEnv: {
        PORT: '36988',
      },
    });

    try {
      assert.equal(await fs.realpath(context.servicePayloadPath), await fs.realpath(launchScriptPath));
      assert.equal(await fs.realpath(context.serviceWorkingDirectory), await fs.realpath(omnirouteRuntimeRoot));

      if (process.platform === 'win32') {
        assert.equal(context.servicePayloadPath, launchScriptPath);
        assert.equal(context.serviceWorkingDirectory, omnirouteRuntimeRoot);
      } else {
        assert.doesNotMatch(context.servicePayloadPath, / /);
        assert.doesNotMatch(context.serviceWorkingDirectory, / /);
        assert.match(context.servicePayloadPath, /\/tmp\/hagicode-desktop-path-alias\//);
        assert.match(context.serviceWorkingDirectory, /\/tmp\/hagicode-desktop-path-alias\//);
      }

      const manifest = await fs.readFile(context.manifestPath, 'utf8');
      assert.ok(manifest.includes('script: ' + context.servicePayloadPath));
      assert.ok(manifest.includes('cwd: ' + context.serviceWorkingDirectory));
    } finally {
      await context.cleanup();
    }
  });
});
