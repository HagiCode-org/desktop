import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const managerPath = path.resolve(process.cwd(), 'src/main/omniroute-manager.ts');
const configPath = path.resolve(process.cwd(), 'src/main/config.ts');

describe('OmniRoute manager contract', () => {
  it('owns the Desktop-managed OmniRoute directory layout through PathManager', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.doesNotMatch(source, /app\.getPath\('userData'\)/);
    assert.match(source, /this\.pathManager\.getOmniRouteRuntimeDataHome\(\)/);
    assert.match(source, /config: path\.join\(root, 'config'\)/);
    assert.match(source, /data: path\.join\(root, 'data'\)/);
    assert.match(source, /logs: path\.join\(root, 'logs'\)/);
    assert.match(source, /const runtime = path\.join\(root, 'runtime'\)/);
    assert.match(source, /fs\.mkdir\(paths\.config, \{ recursive: true \}\)/);
  });

  it('renders Desktop-managed environment files and delegates runtime startup to dedicated hagiscript commands', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /OMNIROUTE_DEFAULT_PORT/);
    assert.match(source, /OMNIROUTE_PROCESS_NAME/);
    assert.match(source, /OMNIROUTE_CONFIG_DIR/);
    assert.match(source, /OMNIROUTE_DATA_DIR/);
    assert.match(source, /OMNIROUTE_LOG_DIR/);
    assert.match(source, /OMNIROUTE_ENV_DIR/);
    assert.match(source, /OMNIROUTE_ENV_PATH/);
    assert.match(source, /OMNIROUTE_RUNTIME_DIR/);
    assert.match(source, /DATA_DIR/);
    assert.match(source, /CLIPROXYAPI_CONFIG_DIR/);
    assert.match(source, /INITIAL_PASSWORD/);
    assert.match(source, /OMNIROUTE_DESKTOP_PASSWORD/);
    assert.match(source, /OMNIROUTE_DESKTOP_SECRET/);
    assert.match(source, /renderEnvironment/);
    assert.match(source, /quoteEnv/);
    assert.match(source, /paths\.envFile/);
    assert.doesNotMatch(source, /resolveVendoredRuntimeLaunchSpec/);
    assert.doesNotMatch(source, /renderEcosystemConfig/);
    assert.doesNotMatch(source, /launchScriptPath:/);
    assert.doesNotMatch(source, /interpreterNone/);
    assert.doesNotMatch(source, /args: \['--no-open'\]/);
    assert.doesNotMatch(source, /module\.exports = \{/);
  });

  it('routes OmniRoute lifecycle through hagiscript-managed dedicated commands without a direct PM2 fallback', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /HagiscriptPm2Manager/);
    assert.match(source, /HagiscriptRuntimeContextResolver/);
    assert.match(source, /this\.vendoredRuntimeActivationService = getVendoredRuntimeActivationService\(/);
    assert.match(source, /this\.pathManager,/);
    assert.match(source, /this\.dependencyManagementService,/);
    assert.match(source, /resolveBundledRuntime\(\{\s*service: 'omniroute',\s*serviceEnv,\s*\}\)/);
    assert.match(source, /this\.hagiscriptPm2Manager\.start\(runtimeContext\)/);
    assert.match(source, /this\.hagiscriptPm2Manager\.stop\(runtimeContext\)/);
    assert.match(source, /this\.hagiscriptPm2Manager\.restart\(runtimeContext\)/);
    assert.match(source, /this\.hagiscriptPm2Manager\.status\(runtimeContext\)/);
    assert.match(source, /getManagedCommandContext\('hagiscript'\)/);
    assert.match(source, /packageId: 'hagiscript'/);
    assert.doesNotMatch(source, /packageId: 'pm2'/);
    assert.match(source, /syncLegacyLogFiles/);
    assert.match(source, /context\.pm2LogsDirectory/);
    assert.match(source, /context\.appName/);
    assert.match(source, /status: \{ \.\.\.status, status: 'error', error: message, remediation: resolvedRemediation \}/);
    assert.match(source, /appendLifecycleFailureLog/);
    assert.match(source, /stdout:/);
    assert.match(source, /stderr:/);
    assert.doesNotMatch(source, /resolvePm2LaunchPlan/);
    assert.doesNotMatch(source, /injectPortableToolchainEnv/);
    assert.doesNotMatch(source, /injectManagedCliPathEnv/);
    assert.doesNotMatch(source, /buildPm2MajorHomePaths/);
    assert.doesNotMatch(source, /startFreshPm2Process/);
    assert.doesNotMatch(source, /isMissingPm2ProcessMessage/);
  });

  it('surfaces remediation metadata and preserves renderer-facing process snapshots', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /buildOmniRouteDependencyRemediation/);
    assert.match(source, /error = details\.remediation\?\.message \?\? details\.error/);
    assert.match(source, /processes: \[details\.process\]/);
    assert.match(source, /name: OMNIROUTE_PROCESS_NAME/);
    assert.match(source, /pid: result\.pid/);
    assert.match(source, /remediation: resolvedRemediation/);
  });

  it('validates OmniRoute port isolation against the configured web service port', async () => {
    const [managerSource, configSource] = await Promise.all([
      fs.readFile(managerPath, 'utf8'),
      fs.readFile(configPath, 'utf8'),
    ]);

    assert.match(configSource, /omniroute\?: \{\s*port\?: number;\s*password\?: string;/);
    assert.match(managerSource, /MIN_PORT = 1024/);
    assert.match(managerSource, /MAX_PORT = 65535/);
    assert.match(managerSource, /DEFAULT_PASSWORD_BYTES = 18/);
    assert.match(managerSource, /generateDefaultPassword/);
    assert.match(managerSource, /validatePassword/);
    assert.match(managerSource, /this\.configManager\.getServerConfig\(\)\.port/);
    assert.match(managerSource, /conflicts with the configured HagiCode web service port/);
    assert.match(managerSource, /OMNIROUTE_DEFAULT_PORT/);
  });

  it('keeps log and path access on allowlisted Desktop-managed targets', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /LOG_FILE_BY_TARGET/);
    assert.match(source, /'service-out': 'omniroute-out\.log'/);
    assert.match(source, /'service-error': 'omniroute-error\.log'/);
    assert.match(source, /PATH_TARGETS/);
    assert.match(source, /\['config', 'data', 'logs'\]/);
    assert.match(source, /await this\.refreshLegacyLogs\(paths\)\.catch\(\(\) => undefined\);/);
    assert.match(source, /source: path\.join\(context\.pm2LogsDirectory, `\$\{context\.appName\}-out\.log`\)/);
    assert.match(source, /source: path\.join\(context\.pm2LogsDirectory, `\$\{context\.appName\}-error\.log`\)/);
    assert.match(source, /ENOENT/);
    assert.match(source, /exists: false/);
    assert.match(source, /slice\(-maxLines\)/);
    assert.match(source, /shell\.openPath/);
  });
});
