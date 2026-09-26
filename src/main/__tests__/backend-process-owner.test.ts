import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it } from 'node:test';
import { BackendProcessOwner, type BackendProcessIdentity, type BackendProcessLaunch } from '../backend-process-owner.js';

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-backend-owner-'));
  const serviceDllPath = path.join(root, 'PCode.Web.dll');
  await fs.writeFile(serviceDllPath, '');
  const launch: BackendProcessLaunch = {
    executablePath: process.execPath,
    args: ['-e', 'console.log("backend-started"); setInterval(() => {}, 1000);', serviceDllPath],
    workingDirectory: root,
    env: process.env,
    runtimeIdentity: `installed-version:${root}:test`,
    runtimeRoot: root,
    serviceDllPath,
    port: 36556,
  };
  return { root, serviceDllPath, launch };
}

function matchingProcess(launch: BackendProcessLaunch, creationIdentity = 'created-once') {
  return {
    executablePath: launch.executablePath,
    creationIdentity,
    commandLine: `${launch.executablePath} ${launch.serviceDllPath}`,
  };
}

function savedIdentity(launch: BackendProcessLaunch, pid: number, creationIdentity: string): BackendProcessIdentity {
  return {
    pid,
    executablePath: launch.executablePath,
    creationIdentity,
    commandLine: `${launch.executablePath} ${launch.serviceDllPath}`,
    runtimeIdentity: launch.runtimeIdentity,
    runtimeRoot: launch.runtimeRoot,
    serviceDllPath: launch.serviceDllPath,
    port: launch.port,
    writtenAt: new Date().toISOString(),
  };
}

describe('Desktop backend process owner', () => {
  it('starts one child for concurrent start requests and captures its output', async () => {
    const fixture = await createFixture();
    const stateFile = path.join(fixture.root, 'runtime', 'backend-process.json');
    const output: string[] = [];
    const owner = new BackendProcessOwner(stateFile, {
      inspectProcess: async () => matchingProcess(fixture.launch),
      signalProcessTree: async (pid, signal) => {
        process.kill(pid, signal);
      },
      platform: process.platform,
      onOutput: (_stream, text) => output.push(text),
    });

    try {
      const [first, second] = await Promise.all([
        owner.start(fixture.launch),
        owner.start(fixture.launch),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(first.pid, second.pid);
      assert.equal(first.isAlive(), true);
      assert.match(output.join(''), /backend-started/);
      const record = JSON.parse(await fs.readFile(stateFile, 'utf8')) as BackendProcessIdentity;
      assert.equal(record.pid, first.pid);
      assert.equal(record.serviceDllPath, fixture.serviceDllPath);
      assert.equal(record.runtimeIdentity, fixture.launch.runtimeIdentity);
      assert.equal(await owner.stop(2_000), true);
      await assert.rejects(fs.access(stateFile), { code: 'ENOENT' });
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('does not signal a reused PID whose creation identity differs', async () => {
    const fixture = await createFixture();
    const stateFile = path.join(fixture.root, 'backend-process.json');
    await fs.writeFile(stateFile, JSON.stringify(savedIdentity(fixture.launch, 43210, 'old-process')));
    let signalCount = 0;
    const owner = new BackendProcessOwner(stateFile, {
      inspectProcess: async () => matchingProcess(fixture.launch, 'new-process'),
      signalProcessTree: async () => {
        signalCount += 1;
      },
      platform: process.platform,
    });

    try {
      await owner.reconcileOrphan();
      assert.equal(signalCount, 0);
      await assert.rejects(fs.access(stateFile), { code: 'ENOENT' });
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('cleans up a verified orphan and clears its runtime-scoped identity', async () => {
    const fixture = await createFixture();
    const stateFile = path.join(fixture.root, 'backend-process.json');
    await fs.writeFile(stateFile, JSON.stringify(savedIdentity(fixture.launch, 43211, 'orphan-process')));
    let isAlive = true;
    const signals: string[] = [];
    const owner = new BackendProcessOwner(stateFile, {
      inspectProcess: async () => isAlive ? matchingProcess(fixture.launch, 'orphan-process') : null,
      signalProcessTree: async (_pid, signal) => {
        signals.push(signal);
        isAlive = false;
      },
      platform: process.platform,
    });

    try {
      await owner.reconcileOrphan();
      assert.deepEqual(signals, ['SIGTERM']);
      await assert.rejects(fs.access(stateFile), { code: 'ENOENT' });
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('forces a bounded shutdown when graceful termination does not exit the child', async () => {
    const fixture = await createFixture();
    const stateFile = path.join(fixture.root, 'backend-process.json');
    const signals: string[] = [];
    const owner = new BackendProcessOwner(stateFile, {
      inspectProcess: async () => matchingProcess(fixture.launch),
      signalProcessTree: async (pid, signal) => {
        signals.push(signal);
        if (signal === 'SIGKILL') {
          process.kill(pid, signal);
        }
      },
      platform: process.platform,
    });

    try {
      await owner.start(fixture.launch);
      assert.equal(await owner.stop(25), true);
      assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });
});
