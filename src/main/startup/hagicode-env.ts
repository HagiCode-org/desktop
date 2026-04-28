import fs from 'node:fs/promises';
import path from 'node:path';

export const HAGICODE_ENV_FILE_NAME = 'hagicode.env';
export const HAGICODE_ENV_KEY_PATTERN = /^HAGICODE_[A-Z0-9_]+$/;

const HAGICODE_RUNTIME_ARG_MAPPINGS = [
  {
    prefix: '--hagicode-user-data-dir=',
    envKey: 'HAGICODE_DESKTOP_USER_DATA_DIR',
  },
  {
    prefix: '--hagicode-non-interactive-log-path=',
    envKey: 'HAGICODE_NON_INTERACTIVE_LOG_PATH',
  },
] as const;

export interface HagicodeEnvDiagnostic {
  lineNumber: number;
  reason: 'invalid-line' | 'invalid-key' | 'unterminated-quote';
  input: string;
  key?: string;
}

export interface ParsedHagicodeEnv {
  values: Record<string, string>;
  diagnostics: HagicodeEnvDiagnostic[];
}

export interface HagicodeEnvCandidateOptions {
  argv?: string[];
  cwd?: string;
  execPath?: string;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
}

export interface ApplyHagicodeEnvOptions extends HagicodeEnvCandidateOptions {
  cliOverrides?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  readFile?: (targetPath: string, encoding: BufferEncoding) => Promise<string>;
}

export interface AppliedHagicodeEnvResult {
  candidateRoots: string[];
  envFilePath: string | null;
  loadedValues: Record<string, string>;
  appliedFileValues: Record<string, string>;
  appliedCliValues: Record<string, string>;
  diagnostics: HagicodeEnvDiagnostic[];
}

function addCandidate(candidates: string[], candidatePath: string | null | undefined): void {
  const normalized = String(candidatePath ?? '').trim();
  if (!normalized) {
    return;
  }

  const resolved = path.resolve(normalized);
  if (!candidates.includes(resolved)) {
    candidates.push(resolved);
  }
}

function resolveEntryScriptAppRoot(argv: string[]): string | null {
  const entryScript = argv[1]?.trim();
  if (!entryScript) {
    return null;
  }

  const normalized = path.resolve(entryScript);
  const entryDir = path.dirname(normalized);
  const parentDir = path.dirname(entryDir);
  const parentName = path.basename(parentDir).toLowerCase();
  const entryDirName = path.basename(entryDir).toLowerCase();

  if (entryDirName === 'main' && (parentName === 'src' || parentName === 'dist')) {
    return path.dirname(parentDir);
  }

  return null;
}

export function resolveHagicodeEnvCandidateRoots(options: HagicodeEnvCandidateOptions = {}): string[] {
  const argv = options.argv ?? process.argv;
  const candidates: string[] = [];

  addCandidate(candidates, options.execPath ? path.dirname(options.execPath) : null);

  if (options.resourcesPath) {
    if ((options.platform ?? process.platform) === 'darwin') {
      addCandidate(candidates, path.resolve(options.resourcesPath, '..', 'MacOS'));
    } else {
      addCandidate(candidates, path.resolve(options.resourcesPath, '..'));
    }
  }

  addCandidate(candidates, resolveEntryScriptAppRoot(argv));
  addCandidate(candidates, options.cwd ?? process.cwd());

  return candidates;
}

function stripWrappingQuotes(rawValue: string): { ok: true; value: string } | { ok: false } {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { ok: true, value: '' };
  }

  const quote = trimmed[0];
  if (quote !== '"' && quote !== '\'') {
    return { ok: true, value: trimmed };
  }

  if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== quote) {
    return { ok: false };
  }

  if (quote === '"') {
    try {
      return {
        ok: true,
        value: JSON.parse(trimmed),
      };
    } catch {
      return { ok: false };
    }
  }

  return { ok: true, value: trimmed.slice(1, -1) };
}

export function parseHagicodeEnv(raw: string): ParsedHagicodeEnv {
  const values: Record<string, string> = {};
  const diagnostics: HagicodeEnvDiagnostic[] = [];
  const lines = raw.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const originalLine = lines[index];
    const trimmed = originalLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const exportPrefix = trimmed.startsWith('export ') ? 'export ' : '';
    const assignment = exportPrefix ? trimmed.slice(exportPrefix.length).trim() : trimmed;
    const separatorIndex = assignment.indexOf('=');
    if (separatorIndex <= 0) {
      diagnostics.push({
        lineNumber,
        reason: 'invalid-line',
        input: originalLine,
      });
      continue;
    }

    const key = assignment.slice(0, separatorIndex).trim();
    if (!HAGICODE_ENV_KEY_PATTERN.test(key)) {
      diagnostics.push({
        lineNumber,
        reason: 'invalid-key',
        input: originalLine,
        key,
      });
      continue;
    }

    const rawValue = assignment.slice(separatorIndex + 1);
    const unquoted = stripWrappingQuotes(rawValue);
    if (!unquoted.ok) {
      diagnostics.push({
        lineNumber,
        reason: 'unterminated-quote',
        input: originalLine,
        key,
      });
      continue;
    }

    values[key] = unquoted.value;
  }

  return {
    values,
    diagnostics,
  };
}

function findRuntimeArgValue(argv: string[], prefix: string): string | null {
  const match = argv.find((arg) => arg.startsWith(prefix));
  const value = match?.slice(prefix.length).trim();
  return value ? value : null;
}

export function collectBootstrapRuntimeEnvOverrides(argv: string[] = process.argv): Record<string, string> {
  const overrides: Record<string, string> = {};

  if (argv.includes('--hagicode-non-interactive-integration')) {
    overrides.HAGICODE_NON_INTERACTIVE_INTEGRATION = '1';
  }

  for (const mapping of HAGICODE_RUNTIME_ARG_MAPPINGS) {
    const value = findRuntimeArgValue(argv, mapping.prefix);
    if (value !== null) {
      overrides[mapping.envKey] = value;
    }
  }

  return overrides;
}

async function findExistingEnvFilePath(
  candidateRoots: string[],
  readFile: ApplyHagicodeEnvOptions['readFile'],
): Promise<{ envFilePath: string | null; fileContent: string | null }> {
  for (const candidateRoot of candidateRoots) {
    const candidatePath = path.join(candidateRoot, HAGICODE_ENV_FILE_NAME);
    try {
      const fileContent = await (readFile ?? fs.readFile)(candidatePath, 'utf8');
      return {
        envFilePath: candidatePath,
        fileContent,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  return {
    envFilePath: null,
    fileContent: null,
  };
}

export async function applyHagicodeEnvFile(options: ApplyHagicodeEnvOptions = {}): Promise<AppliedHagicodeEnvResult> {
  const env = options.env ?? process.env;
  const cliOverrides = { ...(options.cliOverrides ?? {}) };
  const candidateRoots = resolveHagicodeEnvCandidateRoots(options);
  const appliedCliValues: Record<string, string> = {};

  const { envFilePath, fileContent } = await findExistingEnvFilePath(candidateRoots, options.readFile);
  const parsed = fileContent ? parseHagicodeEnv(fileContent) : { values: {}, diagnostics: [] };
  const appliedFileValues: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed.values)) {
    if (Object.prototype.hasOwnProperty.call(cliOverrides, key)) {
      continue;
    }

    env[key] = value;
    appliedFileValues[key] = value;
  }

  for (const [key, value] of Object.entries(cliOverrides)) {
    env[key] = value;
    appliedCliValues[key] = value;
  }

  return {
    candidateRoots,
    envFilePath,
    loadedValues: parsed.values,
    appliedFileValues,
    appliedCliValues,
    diagnostics: parsed.diagnostics,
  };
}

export function formatHagicodeEnvDiagnostics(result: AppliedHagicodeEnvResult): string[] {
  const messages: string[] = [];

  if (result.envFilePath) {
    messages.push(
      `[Bootstrap][hagicode.env] Loaded ${Object.keys(result.loadedValues).length} supported key(s) from ${result.envFilePath}.`,
    );
  }

  for (const diagnostic of result.diagnostics) {
    const keySuffix = diagnostic.key ? ` (${diagnostic.key})` : '';
    messages.push(
      `[Bootstrap][hagicode.env] Ignored line ${diagnostic.lineNumber}${keySuffix}: ${diagnostic.reason}.`,
    );
  }

  return messages;
}
