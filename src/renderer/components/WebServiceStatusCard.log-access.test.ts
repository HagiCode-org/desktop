import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const webServiceStatusCardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');

describe('web service status card log access wiring', () => {
  it('shows the homepage log button whenever local mode has an active version', async () => {
    const source = await fs.readFile(webServiceStatusCardPath, 'utf8');

    assert.match(source, /const showOpenLogsButton = !remoteModeEnabled && Boolean\(activeVersion\);/);
    assert.match(source, /\{\(showRuntimeSecondaryControls \|\| showOpenLogsButton\) && \(/);
    assert.match(source, /\{showOpenLogsButton && \(/);
  });

  it('keeps runtime-only controls gated to the running local service state', async () => {
    const source = await fs.readFile(webServiceStatusCardPath, 'utf8');

    assert.match(source, /const showRuntimeSecondaryControls = !remoteModeEnabled && isRunning;/);
    assert.match(source, /\{showRuntimeSecondaryControls && \(/);
  });

  it('routes homepage log clicks through the shared log-directory bridge and error codes', async () => {
    const source = await fs.readFile(webServiceStatusCardPath, 'utf8');

    assert.match(source, /const WEB_APP_LOG_DIRECTORY_TARGET: LogDirectoryTarget = 'web-app';/);
    assert.match(source, /window\.electronAPI\.logDirectory\.open\(WEB_APP_LOG_DIRECTORY_TARGET\)/);
    assert.doesNotMatch(source, /window\.electronAPI\.versionOpenLogs\(activeVersion\.id\)/);
    assert.match(source, /case 'no_active_version':/);
    assert.match(source, /case 'logs_not_found':/);
    assert.match(source, /case 'open_failed':/);
  });
});
