import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';

export const RUNTIME_MANIFEST_FILE = 'manifest.yml';
const DESKTOP_DEV_INSTANCE_NAME = 'hagicode_dev';

export interface RuntimeManifestStore {
  runtime?: unknown;
  paths?: unknown;
  components?: unknown;
  phases?: unknown;
  npmSync?: unknown;
  desktopExtensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResolveRuntimeManifestPathOptions {
  manifestPath?: string;
  userDataPath?: string | null;
  cwd?: string;
  moduleDirectory?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (targetPath: string) => boolean;
  mkdirSync?: (targetPath: string, options?: fs.MakeDirectoryOptions) => string | undefined;
  readFileSync?: typeof fs.readFileSync;
  writeFileSync?: typeof fs.writeFileSync;
}

let registeredUserDataPath: string | null = null;

export function registerRuntimeManifestUserDataPath(userDataPath: string): void {
  registeredUserDataPath = path.resolve(userDataPath);
}

export function resolveRuntimeManifestDataScopePath(
  userDataPath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const normalizedPath = path.resolve(userDataPath);
  return env.HAGICODE_DESKTOP_INSTANCE_NAME?.trim() === DESKTOP_DEV_INSTANCE_NAME
    && path.basename(normalizedPath) !== 'dev'
    ? path.join(normalizedPath, 'dev')
    : normalizedPath;
}

export function getUserDataRuntimeManifestPath(
  userDataPath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveRuntimeManifestDataScopePath(userDataPath, env), RUNTIME_MANIFEST_FILE);
}

export function resolveBundledRuntimeManifestCandidates(
  moduleDirectory: string = path.dirname(fileURLToPath(import.meta.url)),
  cwd: string = process.cwd(),
): string[] {
  return [
    path.resolve(cwd, 'resources', RUNTIME_MANIFEST_FILE),
    path.resolve(moduleDirectory, '../../resources', RUNTIME_MANIFEST_FILE),
  ];
}

export function resolveRuntimeManifestCandidates(options: {
  userDataPath?: string | null;
  cwd?: string;
  moduleDirectory?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string[] {
  const candidates: string[] = [];
  const userDataPath = Object.prototype.hasOwnProperty.call(options, 'userDataPath')
    ? options.userDataPath
    : registeredUserDataPath;
  if (userDataPath?.trim()) {
    candidates.push(getUserDataRuntimeManifestPath(userDataPath, options.env));
  }

  candidates.push(...resolveBundledRuntimeManifestCandidates(options.moduleDirectory, options.cwd));
  return candidates;
}

function getBundledRuntimeManifestPath(options: ResolveRuntimeManifestPathOptions = {}): string {
  const existsSync = options.existsSync ?? fs.existsSync;
  const candidates = resolveBundledRuntimeManifestCandidates(options.moduleDirectory, options.cwd);
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(`Runtime manifest was not found. Checked: ${candidates.join(', ')}`);
  }

  return match;
}

function ensureUserDataRuntimeManifest(
  userDataPath: string,
  options: ResolveRuntimeManifestPathOptions = {},
): string {
  const targetPath = getUserDataRuntimeManifestPath(userDataPath, options.env);
  const sourcePath = getBundledRuntimeManifestPath(options);
  const existsSync = options.existsSync ?? fs.existsSync;
  const mkdirSync = options.mkdirSync ?? fs.mkdirSync;
  const readFileSync = options.readFileSync ?? fs.readFileSync;
  const writeFileSync = options.writeFileSync ?? fs.writeFileSync;
  const sourceContent = readFileSync(sourcePath, 'utf8');
  const materializedContent = materializeRuntimeManifestContent(
    sourceContent,
    resolveRuntimeManifestDataScopePath(userDataPath, options.env),
    path.dirname(sourcePath),
  );
  const currentContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;

  if (currentContent !== materializedContent) {
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, materializedContent, 'utf8');
  }

  return targetPath;
}

export function getRuntimeManifestPath(options: ResolveRuntimeManifestPathOptions = {}): string {
  if (options.manifestPath) {
    return path.resolve(options.manifestPath);
  }

  const userDataPath = Object.prototype.hasOwnProperty.call(options, 'userDataPath')
    ? options.userDataPath
    : registeredUserDataPath;
  if (userDataPath?.trim()) {
    return ensureUserDataRuntimeManifest(userDataPath, options);
  }

  return getBundledRuntimeManifestPath(options);
}

export function readRuntimeManifestStore(
  options: ResolveRuntimeManifestPathOptions = {},
): RuntimeManifestStore {
  const manifestPath = getRuntimeManifestPath(options);
  const content = (options.readFileSync ?? fs.readFileSync)(manifestPath, 'utf8');
  const parsed = load(content);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`Runtime manifest ${manifestPath} must be a YAML object.`);
  }

  return parsed as RuntimeManifestStore;
}

export function readRuntimeManifestRoot(
  options: ResolveRuntimeManifestPathOptions = {},
): RuntimeManifestStore {
  return readRuntimeManifestStore(options);
}

export function readRuntimeManifestSection<T>(
  sectionName: keyof RuntimeManifestStore,
  options: ResolveRuntimeManifestPathOptions = {},
): T {
  const manifest = readRuntimeManifestStore(options);
  const section = resolveRuntimeManifestSection(manifest, String(sectionName));
  if (!section || Array.isArray(section) || typeof section !== 'object') {
    throw new Error(`Runtime manifest section "${String(sectionName)}" is missing or invalid.`);
  }

  return section as T;
}

function resolveRuntimeManifestSection(
  manifest: RuntimeManifestStore,
  sectionName: string,
): unknown {
  const directSection = manifest[sectionName];
  if (directSection && !Array.isArray(directSection) && typeof directSection === 'object') {
    return directSection;
  }

  if (sectionName === 'desktopRuntime') {
    return synthesizeDesktopRuntimeSection(manifest);
  }

  const desktopExtensions = asRecord(manifest.desktopExtensions);
  if (!desktopExtensions) {
    return undefined;
  }

  return desktopExtensions[sectionName];
}

function synthesizeDesktopRuntimeSection(manifest: RuntimeManifestStore): Record<string, unknown> {
  const runtime = asRecord(manifest.runtime);
  const paths = asRecord(manifest.paths);
  const desktopExtensions = asRecord(manifest.desktopExtensions);
  const distribution = asRecord(desktopExtensions?.distribution);
  const programHomes = asRecord(distribution?.programHomes);
  const codeServerComponent = findRuntimeComponent(manifest, 'code-server');
  const componentDataRoot = normalizeRelativePath(readString(paths?.componentDataRoot)) ?? 'components';
  const nodeRuntime = normalizeRelativePath(readString(paths?.nodeRuntime)) ?? 'components/node/runtime';
  const dotnetRuntime = normalizeRelativePath(readString(paths?.dotnetRuntime)) ?? 'components/dotnet/runtime';
  const vendoredRoot = normalizeRelativePath(readString(paths?.vendoredRoot)) ?? 'components/bundled';
  const runtimeDataRelativePath = normalizeRelativePath(readString(distribution?.runtimeDataRelativePath)) ?? 'runtimeData';

  return {
    schemaVersion: 1,
    runtimeVersion: readString(runtime?.version) ?? '0.1.0',
    programHomes: {
      development: readString(programHomes?.development) ?? 'resources',
      packaged: readString(programHomes?.packaged) ?? 'extra/runtime',
    },
    env: {
      programHome: 'HAGICODE_RUNTIME_HOME',
      dataHome: 'HAGICODE_RUNTIME_DATA_HOME',
    },
    dataHome: {
      defaultRelativePath: runtimeDataRelativePath,
      shared: {
        config: normalizeRelativePath(readString(paths?.config)) ?? 'config',
        logs: normalizeRelativePath(readString(paths?.logs)) ?? 'logs',
        data: normalizeRelativePath(readString(paths?.data)) ?? 'data',
        state: normalizeRelativePath(readString(paths?.stateFile)) ?? 'state.json',
      },
    },
    components: {
      dotnet: {
        relativePath: `${dotnetRuntime}/{platform}`,
      },
      node: {
        relativePath: nodeRuntime,
      },
      'code-server': {
        relativePath: joinRelativePath(vendoredRoot, 'code-server'),
      },
    },
    services: {
      'code-server': {
        dataRelativePath: joinRelativePath(
          componentDataRoot,
          normalizeRelativePath(readString(codeServerComponent?.runtimeDataDir)) ?? 'services/code-server',
        ),
      },
    },
    npmSync: asRecord(manifest.npmSync) ?? undefined,
  };
}

function findRuntimeComponent(
  manifest: RuntimeManifestStore,
  componentName: string,
): Record<string, unknown> | null {
  const components = Array.isArray(manifest.components) ? manifest.components : [];
  for (const component of components) {
    const componentRecord = asRecord(component);
    if (componentRecord && readString(componentRecord.name) === componentName) {
      return componentRecord;
    }
  }

  return null;
}

function joinRelativePath(...parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('/')
    .replace(/\/+/gu, '/');
}

function normalizeRelativePath(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\\/gu, '/').replace(/^\.\/+/u, '');
  return normalized ? normalized : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

export function materializeRuntimeManifestContent(
  manifestContent: string,
  dataScopePath: string,
  manifestDirectory?: string,
): string {
  const parsed = load(manifestContent);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Bundled runtime manifest must be a YAML object.');
  }

  const manifest = parsed as RuntimeManifestStore;
  const paths = asRecord(manifest.paths);
  if (!paths) {
    throw new Error('Bundled runtime manifest is missing the paths section.');
  }

  const normalizedScopePath = path.resolve(dataScopePath);
  paths.runtimeDataRoot = path.join(normalizedScopePath, 'runtimeData');
  paths.serverProgramRoot = path.join(normalizedScopePath, 'apps', 'installed');
  paths.serverDataRoot = path.join(normalizedScopePath, 'apps', 'data');
  rebaseManifestLifecycleScripts(manifest, manifestDirectory);

  return dump(manifest, {
    noRefs: true,
    lineWidth: 120,
  });
}

function rebaseManifestLifecycleScripts(
  manifest: RuntimeManifestStore,
  manifestDirectory?: string,
): void {
  if (!manifestDirectory || !Array.isArray(manifest.components)) {
    return;
  }

  for (const component of manifest.components) {
    const componentRecord = asRecord(component);
    if (!componentRecord) {
      continue;
    }

    for (const scriptKey of ['installScript', 'verifyScript', 'configureScript', 'updateScript', 'removeScript']) {
      const scriptPath = readString(componentRecord[scriptKey]);
      if (!scriptPath || path.isAbsolute(scriptPath)) {
        continue;
      }

      componentRecord[scriptKey] = path.resolve(manifestDirectory, scriptPath);
    }
  }
}
