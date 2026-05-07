import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const managerPath = path.resolve(process.cwd(), 'src/main/code-server-manager.ts');
const handlerPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/dependencyManagementHandlers.ts');
const codeServerHandlerPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/codeServerHandlers.ts');

describe('code-server manager contract', () => {
  it('uses PM2 with scoped bundled Node injection, password auth, and Desktop-owned runtime directories', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /PROCESS_NAME = 'hagicode-code-server'/);
    assert.match(source, /injectCodeServerRuntimeEnv\(pm2\.env, this\.pathManager/);
    assert.match(source, /buildPm2MajorHomePaths/);
    assert.match(source, /--bind-addr/);
    assert.match(source, /--auth',\s*'password'/);
    assert.match(source, /PASSWORD:/);
    assert.match(source, /--user-data-dir/);
    assert.match(source, /--extensions-dir/);
    assert.match(source, /code-server-out\.log/);
    assert.match(source, /code-server-error\.log/);
    assert.match(source, /this\.configManager\.set\('codeServer'/);
    assert.match(source, /normalizePassword/);
    assert.match(source, /readLog\(request: CodeServerLogReadRequest\)/);
    assert.match(source, /Vendored code-server repair is only available in development builds/);
    assert.match(source, /Desktop-managed PM2 is unavailable/);
    assert.match(source, /fetch\(baseUrl/);
  });

  it('registers vendored runtime lifecycle IPC handlers through dependency management channels', async () => {
    const source = await fs.readFile(handlerPath, 'utf8');

    assert.match(source, /handleStartVendoredRuntime/);
    assert.match(source, /handleStopVendoredRuntime/);
    assert.match(source, /handleRestartVendoredRuntime/);
    assert.match(source, /handleRepairVendoredRuntime/);
    assert.match(source, /handleOpenVendoredRuntimePath/);
    assert.match(source, /dependencyManagementChannels\.startVendoredRuntime/);
    assert.match(source, /dependencyManagementChannels\.openVendoredRuntimePath/);
  });

  it('registers dedicated code server IPC handlers for status, config, logs, and paths', async () => {
    const source = await fs.readFile(codeServerHandlerPath, 'utf8');

    assert.match(source, /codeServerChannels\.status/);
    assert.match(source, /codeServerChannels\.start/);
    assert.match(source, /codeServerChannels\.setConfig/);
    assert.match(source, /codeServerChannels\.readLog/);
    assert.match(source, /codeServerChannels\.openPath/);
    assert.match(source, /codeServerChannels\.statusChanged/);
  });
});
