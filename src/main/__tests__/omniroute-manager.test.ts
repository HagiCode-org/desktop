import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const managerPath = path.resolve(process.cwd(), 'src/main/omniroute-manager.ts');
const configPath = path.resolve(process.cwd(), 'src/main/config.ts');

describe('OmniRoute manager contract', () => {
  it('owns the Desktop userData OmniRoute directory layout', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /app\.getPath\('userData'\)/);
    assert.match(source, /path\.join\(this\.userDataPath, 'OmniRoute'\)/);
    assert.match(source, /config: path\.join\(root, 'config'\)/);
    assert.match(source, /data: path\.join\(root, 'data'\)/);
    assert.match(source, /logs: path\.join\(root, 'logs'\)/);
    assert.match(source, /const runtime = path\.join\(root, 'runtime'\)/);
    assert.match(source, /fs\.mkdir\(paths\.config, \{ recursive: true \}\)/);
  });

  it('renders environment and PM2 ecosystem files for only the desktop OmniRoute service process', async () => {
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
    assert.match(source, /DATA_DIR: \${JSON\.stringify\(paths\.data\)}/);
    assert.match(source, /CLIPROXYAPI_CONFIG_DIR: \${JSON\.stringify\(paths\.config\)}/);
    assert.match(source, /INITIAL_PASSWORD/);
    assert.match(source, /OMNIROUTE_DESKTOP_PASSWORD/);
    assert.match(source, /OMNIROUTE_DESKTOP_SECRET/);
    assert.match(source, /script: 'omniroute'/);
    assert.match(source, /args: \[\s*'serve'\s*\]/);
    assert.match(source, /autorestart: true/);
    assert.match(source, /restart_delay: 3000/);
    assert.match(source, /omniroute-out\.log/);
    assert.match(source, /omniroute-error\.log/);
    assert.doesNotMatch(source, /omniroute-reconcile/);
  });

  it('uses Desktop-managed PM2 and scopes lifecycle commands by process name', async () => {
    const source = await fs.readFile(managerPath, 'utf8');

    assert.match(source, /getManagedCommandContext\('pm2'\)/);
    assert.match(source, /PM2 is not installed in the Desktop-managed npm environment/);
    assert.match(source, /\['start', paths\.ecosystemFile, '--only', OMNIROUTE_PROCESS_NAME, '--update-env'\]/);
    assert.match(source, /\['stop', OMNIROUTE_PROCESS_NAME\]/);
    assert.match(source, /\['restart', OMNIROUTE_PROCESS_NAME, '--update-env'\]/);
    assert.match(source, /item\.name === OMNIROUTE_PROCESS_NAME/);
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
    assert.match(source, /ENOENT/);
    assert.match(source, /exists: false/);
    assert.match(source, /slice\(-maxLines\)/);
    assert.match(source, /shell\.openPath/);
  });
});
