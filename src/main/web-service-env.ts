export type WebServiceConfigMode = 'env' | 'legacy-yaml';

export type EnvSnapshotLogLevel = 'off' | 'summary' | 'detailed';

export type ManagedEnvSource = 'runtime' | 'yaml' | 'existing-env' | 'default';

export interface ManagedEnvVarDefinition {
  key: string;
  sourceConfig: string;
  required: boolean;
  sensitive: boolean;
  defaultValue?: string;
  yamlPath?: string;
}

export interface ManagedEnvSnapshotEntry {
  key: string;
  value: string;
  source: ManagedEnvSource;
  sourceConfig: string;
  sensitive: boolean;
  defaultApplied: boolean;
}

export interface BuildManagedEnvInput {
  host: string;
  port: number;
  dataDir?: string | null;
  systemVaultEnvEntries?: Record<string, string> | null;
  yamlConfig?: Record<string, unknown> | null;
  existingEnv?: Record<string, string | undefined>;
}

export interface BuildManagedEnvResult {
  injectedEnv: Record<string, string>;
  snapshot: ManagedEnvSnapshotEntry[];
  errors: string[];
  warnings: string[];
}

const MAX_ENV_VALUE_LENGTH = 32767;

export const MANAGED_ENV_VAR_DEFINITIONS: ReadonlyArray<ManagedEnvVarDefinition> = [
  {
    key: 'ASPNETCORE_URLS',
    sourceConfig: 'webService.host + webService.port',
    required: true,
    sensitive: false,
  },
  {
    key: 'Urls',
    sourceConfig: 'webService.host + webService.port',
    required: true,
    sensitive: false,
  },
  {
    key: 'DATADIR',
    sourceConfig: 'DataDir',
    required: true,
    sensitive: false,
    defaultValue: './data',
    yamlPath: 'DataDir',
  },
  {
    key: 'Database__Provider',
    sourceConfig: 'Database.Provider',
    required: true,
    sensitive: false,
    defaultValue: 'sqlite',
    yamlPath: 'Database.Provider',
  },
  {
    key: 'ConnectionStrings__Default',
    sourceConfig: 'ConnectionStrings.Default',
    required: false,
    sensitive: true,
    yamlPath: 'ConnectionStrings.Default',
  },
  {
    key: 'AI__Providers__DefaultProvider',
    sourceConfig: 'agentCliSelection (electron-store)',
    required: true,
    sensitive: false,
    defaultValue: 'ClaudeCodeCli',
  },
  {
    key: 'HAGICODE_LOG_FORMAT',
    sourceConfig: 'HAGICODE_LOG_FORMAT',
    required: true,
    sensitive: false,
    defaultValue: 'plain',
  },
] as const;

export function resolveWebServiceConfigMode(value?: string | null): WebServiceConfigMode {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'legacy-yaml' || normalized === 'legacy' || normalized === 'yaml') {
    return 'legacy-yaml';
  }
  return 'env';
}

export function resolveEnvSnapshotLogLevel(value?: string | null): EnvSnapshotLogLevel {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'off') return 'off';
  if (normalized === 'detailed') return 'detailed';
  return 'summary';
}

export function buildManagedServiceEnv(input: BuildManagedEnvInput): BuildManagedEnvResult {
  const injectedEnv: Record<string, string> = {};
  const snapshot: ManagedEnvSnapshotEntry[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const existingEnv = input.existingEnv ?? {};

  for (const definition of MANAGED_ENV_VAR_DEFINITIONS) {
    if (!isValidEnvKey(definition.key)) {
      errors.push(`Invalid env key: ${definition.key}`);
      continue;
    }

    const resolved = resolveValue(definition, input, existingEnv);
    if (resolved.value === undefined || resolved.value === null || resolved.value === '') {
      if (definition.required) {
        errors.push(`Missing required env value: ${definition.key}`);
      }
      continue;
    }

    if (resolved.value.length > MAX_ENV_VALUE_LENGTH) {
      errors.push(`Env value too long for ${definition.key} (>${MAX_ENV_VALUE_LENGTH})`);
      continue;
    }

    injectedEnv[definition.key] = resolved.value;
    snapshot.push({
      key: definition.key,
      value: resolved.value,
      source: resolved.source,
      sourceConfig: definition.sourceConfig,
      sensitive: definition.sensitive || isSensitiveEnvKey(definition.key),
      defaultApplied: resolved.source === 'default',
    });
  }

  for (const [key, rawValue] of Object.entries(input.systemVaultEnvEntries ?? {})) {
    if (!isValidEnvKey(key)) {
      warnings.push(`Skipped system-managed vault env key '${key}' because the key is invalid.`);
      continue;
    }

    const value = sanitizeString(rawValue);
    if (!value) {
      warnings.push(`Skipped system-managed vault env key '${key}' because the value was empty.`);
      continue;
    }

    if (value.length > MAX_ENV_VALUE_LENGTH) {
      warnings.push(`Skipped system-managed vault env key '${key}' because the value exceeds ${MAX_ENV_VALUE_LENGTH} characters.`);
      continue;
    }

    injectedEnv[key] = value;
    snapshot.push({
      key,
      value,
      source: 'runtime',
      sourceConfig: 'desktop system-managed vault descriptors',
      sensitive: false,
      defaultApplied: false,
    });
  }

  return { injectedEnv, snapshot, errors, warnings };
}

function resolveValue(
  definition: ManagedEnvVarDefinition,
  input: BuildManagedEnvInput,
  existingEnv: Record<string, string | undefined>
): { value?: string; source: ManagedEnvSource } {
  if (definition.key === 'ASPNETCORE_URLS' || definition.key === 'Urls') {
    return {
      value: `http://${input.host}:${input.port}`,
      source: 'runtime',
    };
  }

  if (definition.key === 'DATADIR') {
    const runtimeDataDir = sanitizeString(input.dataDir);
    if (runtimeDataDir) {
      return { value: runtimeDataDir, source: 'runtime' };
    }
  }

  const existingValue = sanitizeString(existingEnv[definition.key]);
  if (existingValue) {
    return { value: existingValue, source: 'existing-env' };
  }

  const yamlValue = definition.yamlPath ? sanitizeString(getNestedValue(input.yamlConfig, definition.yamlPath)) : undefined;
  if (yamlValue) {
    return { value: yamlValue, source: 'yaml' };
  }

  if (definition.defaultValue !== undefined) {
    return { value: definition.defaultValue, source: 'default' };
  }

  return { source: 'default' };
}

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getNestedValue(source: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!source) {
    return undefined;
  }

  const segments = path.split('.');
  let current: unknown = source;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

export function isSensitiveEnvKey(key: string): boolean {
  return /(password|pwd|secret|token|apikey|connectionstring)/i.test(key);
}

export function maskEnvValue(key: string, value: string): string {
  if (!isSensitiveEnvKey(key)) {
    return value;
  }

  if (/ConnectionStrings__/i.test(key)) {
    return maskConnectionString(value);
  }

  return '***';
}

export function sortSnapshotEntries(entries: ReadonlyArray<ManagedEnvSnapshotEntry>): ManagedEnvSnapshotEntry[] {
  return [...entries].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildSnapshotLogLines(
  entries: ReadonlyArray<ManagedEnvSnapshotEntry>,
  level: EnvSnapshotLogLevel
): string[] {
  const sorted = sortSnapshotEntries(entries);
  return sorted.map((entry) => {
    const maskedValue = entry.sensitive ? maskEnvValue(entry.key, entry.value) : entry.value;
    if (level === 'detailed') {
      return `[WebService][Env][${entry.source}] ${entry.key}=${maskedValue} (source=${entry.sourceConfig}, default=${entry.defaultApplied})`;
    }
    return `[WebService][Env][${entry.source}] ${entry.key}=${maskedValue}`;
  });
}

function maskConnectionString(value: string): string {
  const masked = value
    .replace(/(password|pwd)\s*=\s*[^;]*/ig, '$1=***')
    .replace(/(user\s*id|uid|username)\s*=\s*[^;]*/ig, '$1=***')
    .replace(/(token|secret)\s*=\s*[^;]*/ig, '$1=***')
    .replace(/\/\/([^:@/]+):([^@/]+)@/g, '//***:***@');

  if (masked.length <= 180) {
    return masked;
  }

  return `${masked.slice(0, 90)}...${masked.slice(-40)}`;
}
