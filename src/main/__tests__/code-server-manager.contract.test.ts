import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const managerPath = path.resolve(process.cwd(), 'src/main/code-server-manager.ts');
const handlerPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/dependencyManagementHandlers.ts');
const codeServerHandlerPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/codeServerHandlers.ts');

describe('code-server manager contract', () => {
  it('routes lifecycle through the Desktop SDK PM2 adapter while preserving Desktop-owned directories', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /PROCESS_NAME = 'hagicode-code-server'/);
    assert.match(source, /HagiscriptPm2Manager/);
    assert.match(source, /HagiscriptRuntimeContextResolver/);
    assert.match(source, /getVendoredRuntimeActivationService/);
    assert.match(source, /this\.vendoredRuntimeActivationService = getVendoredRuntimeActivationService\(/);
    assert.match(source, /this\.pathManager,/);
    assert.match(source, /this\.dependencyManagementService,/);
    assert.match(source, /const launchScriptPath = runtime\.entryScriptPath \?\? runtime\.wrapperPath \?\? null;/);
    assert.match(source, /resolveBundledRuntime\(\{\s*service: 'code-server',/);
    assert.match(source, /launchScriptPath,/);
    assert.match(source, /launchWorkingDirectory,/);
    assert.match(source, /launchArgs: \[/);
    assert.match(source, /this\.hagiscriptPm2Manager\.start\(runtimeContext\)/);
    assert.match(source, /this\.hagiscriptPm2Manager\.stop\(runtimeContext\)/);
    assert.match(source, /this\.hagiscriptPm2Manager\.restart\(runtimeContext\)/);
    assert.match(source, /this\.hagiscriptPm2Manager\.status\(runtimeContext\)/);
    assert.match(source, /getManagedCommandContext\('pm2'\)/);
    assert.match(source, /async enable\(\): Promise<VendoredRuntimeLifecycleResult>/);
    assert.match(source, /return this\.runLifecycle\('enable'\)/);
    assert.match(source, /action === 'repair' \|\| action === 'enable'/);
    assert.match(source, /this\.vendoredRuntimeActivationService\.activate\('code-server'\)/);
    assert.match(source, /runtime\.status === 'extracting'/);
    assert.match(source, /buildManagedServiceEnvironment/);
    assert.match(source, /PASSWORD:/);
    assert.match(source, /auth: password/);
    assert.match(source, /password: /);
    assert.match(source, /user-data-dir:/);
    assert.match(source, /extensions-dir:/);
    assert.match(source, /CODE_SERVER_BIND_HOST:/);
    assert.match(source, /CODE_SERVER_BIND_PORT:/);
    assert.match(source, /HAGICODE_CODE_SERVER_DATA_DIR:/);
    assert.match(source, /HAGICODE_CODE_SERVER_EXTENSIONS_DIR:/);
    assert.match(source, /code-server-out\.log/);
    assert.match(source, /code-server-error\.log/);
    assert.match(source, /this\.configManager\.set\('codeServer'/);
    assert.match(source, /normalizePassword/);
    assert.match(source, /readLog\(request: CodeServerLogReadRequest\)/);
    assert.match(source, /Desktop-managed PM2 is unavailable/);
    assert.match(source, /fetch\(baseUrl/);
    assert.match(source, /context\.pm2LogsDirectory/);
    assert.match(source, /context\.appName/);
    assert.match(source, /appendLifecycleFailureLog/);
    assert.match(source, /stdout:/);
    assert.match(source, /stderr:/);
    assert.match(source, /\[CodeServerManager\] lifecycle operation failed/);
    assert.doesNotMatch(source, /resolveLaunchSpec/);
    assert.doesNotMatch(source, /renderEcosystem/);
    assert.match(source, /--bind-addr/);
    assert.match(source, /--auth/);
    assert.match(source, /--user-data-dir/);
    assert.match(source, /--extensions-dir/);
    assert.match(source, /--disable-telemetry/);
    assert.doesNotMatch(source, /module\.exports =/);
    assert.doesNotMatch(source, /Pm2DotnetManager/);
    assert.doesNotMatch(source, /resolvePm2LaunchPlan/);
    assert.doesNotMatch(source, /injectCodeServerRuntimeEnv/);
    assert.doesNotMatch(source, /injectManagedCliPathEnv/);
    assert.doesNotMatch(source, /buildPm2MajorHomePaths/);
    assert.doesNotMatch(source, /ensurePm2HomeAlias/);
  });

  it('registers vendored runtime lifecycle IPC handlers and activation progress broadcasts', async () => {
    const source = await fs.readFile(handlerPath, 'utf8');

    assert.match(source, /handleEnableVendoredRuntime/);
    assert.match(source, /handleStartVendoredRuntime/);
    assert.match(source, /handleStopVendoredRuntime/);
    assert.match(source, /handleRestartVendoredRuntime/);
    assert.match(source, /handleRepairVendoredRuntime/);
    assert.match(source, /handleOpenVendoredRuntimePath/);
    assert.match(source, /dependencyManagementChannels\.enableVendoredRuntime/);
    assert.match(source, /dependencyManagementChannels\.vendoredRuntimeActivationProgress/);
    assert.match(source, /legacyDependencyManagementChannels\.vendoredRuntimeActivationProgress/);
    assert.match(source, /onVendoredRuntimeActivationProgress\(/);
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
    assert.match(source, /status: 'error'/);
    assert.match(source, /error: result\.error/);
  });
});
