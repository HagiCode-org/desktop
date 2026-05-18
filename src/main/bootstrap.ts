import { electron } from '../electron-api.js';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  extractNonInteractiveUserArgs,
  nonInteractiveExitCodes,
  parseNonInteractiveCommand,
  runNonInteractiveCommand,
} from './non-interactive-mode.js';
import {
  applyHagicodeEnvFile,
  collectBootstrapRuntimeEnvOverrides,
  formatHagicodeEnvDiagnostics,
} from './startup/hagicode-env.js';

const { app } = electron;

function findRuntimeArgValue(prefix: string): string | null {
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  const value = match?.slice(prefix.length).trim();
  return value ? value : null;
}

const hagicodeEnvResult = await applyHagicodeEnvFile({
  argv: process.argv,
  cliOverrides: collectBootstrapRuntimeEnvOverrides(process.argv),
  cwd: process.cwd(),
  env: process.env,
  execPath: process.execPath,
  platform: process.platform,
  resourcesPath: process.resourcesPath,
});

for (const message of formatHagicodeEnvDiagnostics(hagicodeEnvResult)) {
  console.warn(message);
}

const nonInteractiveIntegrationMode = process.env.HAGICODE_NON_INTERACTIVE_INTEGRATION === '1'
  || process.argv.includes('--hagicode-non-interactive-integration');
const nonInteractiveDiagnosticLogPath = findRuntimeArgValue('--hagicode-non-interactive-log-path=')
  ?? process.env.HAGICODE_NON_INTERACTIVE_LOG_PATH?.trim()
  ?? null;
const nonInteractiveUserDataDir = findRuntimeArgValue('--hagicode-user-data-dir=')
  ?? process.env.HAGICODE_DESKTOP_USER_DATA_DIR?.trim()
  ?? null;
const nonInteractiveUserArgs = extractNonInteractiveUserArgs(process.argv);
const nonInteractiveParseResult = parseNonInteractiveCommand(process.argv);

function writeNonInteractiveDiagnostic(message: string, payload?: unknown): void {
  if (!nonInteractiveDiagnosticLogPath) {
    return;
  }

  try {
    fsSync.mkdirSync(path.dirname(nonInteractiveDiagnosticLogPath), { recursive: true });
    const suffix = payload === undefined ? '' : ` ${JSON.stringify(payload)}`;
    fsSync.appendFileSync(
      nonInteractiveDiagnosticLogPath,
      `${new Date().toISOString()} ${message}${suffix}\n`,
      'utf8',
    );
  } catch {
    // Best-effort diagnostics only.
  }
}

function writeBootstrapDiagnostic(): void {
  if (!nonInteractiveIntegrationMode) {
    return;
  }

  const diagnostic = nonInteractiveParseResult.handled
    ? {
      argv: process.argv,
      extractedUserArgs: nonInteractiveUserArgs,
      handled: true,
      ok: nonInteractiveParseResult.ok,
      userArgs: nonInteractiveParseResult.userArgs,
      error: nonInteractiveParseResult.ok ? null : nonInteractiveParseResult.error,
    }
    : {
      argv: process.argv,
      extractedUserArgs: nonInteractiveUserArgs,
      handled: false,
      reason: nonInteractiveParseResult.reason,
    };

  console.log('[Bootstrap] Non-interactive integration argv diagnostic', JSON.stringify(diagnostic));
  writeNonInteractiveDiagnostic('[Bootstrap] Non-interactive integration argv diagnostic', diagnostic);
}

async function runNonInteractiveBootstrap(): Promise<void> {
  writeBootstrapDiagnostic();

  if (nonInteractiveUserDataDir) {
    app.setPath('userData', path.resolve(nonInteractiveUserDataDir));
    app.setAppLogsPath(path.resolve(nonInteractiveUserDataDir, 'logs'));
  }

  app.whenReady().then(async () => {
    writeNonInteractiveDiagnostic('[Bootstrap] app.whenReady reached for non-interactive command');
    const result = await runNonInteractiveCommand(nonInteractiveParseResult);
    writeNonInteractiveDiagnostic('[Bootstrap] Non-interactive command completed', result);
    app.exit(result.exitCode);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    writeNonInteractiveDiagnostic('[Bootstrap] Non-interactive command failed before dispatch', { error: message });
    console.error('[Bootstrap] Non-interactive command failed before dispatch');
    console.error(message);
    app.exit(nonInteractiveExitCodes.internal);
  });
}

async function runGuiBootstrap(): Promise<void> {
  if (nonInteractiveIntegrationMode) {
    writeBootstrapDiagnostic();
    writeNonInteractiveDiagnostic('[Bootstrap] Integration mode did not include a supported command; refusing GUI startup.');
    console.error('Non-interactive integration mode did not include a supported command.');
    app.exit(nonInteractiveExitCodes.usage);
    return;
  }

  await import('./main.js');
}

if (nonInteractiveParseResult.handled) {
  await runNonInteractiveBootstrap();
} else {
  await runGuiBootstrap();
}
