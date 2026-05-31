import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, dump } from 'js-yaml';

export const RUNTIME_MANIFEST_FILE = 'manifest.yml';
const DESKTOP_DEV_INSTANCE_NAME = 'hagicode_dev';

function resolveDesktopProductName() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const productName = packageJson.productName?.trim();
    if (productName) {
      return productName;
    }
  } catch {
    // Fall through to the hard-coded desktop product name.
  }

  return 'Hagicode Desktop';
}

export function resolveScriptUserDataPath(env = process.env, platform = process.platform) {
  const explicitUserDataPath = env.HAGICODE_DESKTOP_USER_DATA_DIR?.trim();
  if (explicitUserDataPath) {
    return path.resolve(explicitUserDataPath);
  }

  const productName = resolveDesktopProductName();
  if (platform === 'win32') {
    const appDataRoot = env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appDataRoot, productName);
  }

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', productName);
  }

  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
  return path.join(xdgConfigHome, productName);
}

export function resolveRuntimeManifestDataScopePath(
  userDataPath = resolveScriptUserDataPath(),
  env = process.env,
) {
  const normalizedPath = path.resolve(userDataPath);
  return env.HAGICODE_DESKTOP_INSTANCE_NAME?.trim() === DESKTOP_DEV_INSTANCE_NAME
    && path.basename(normalizedPath) !== 'dev'
    ? path.join(normalizedPath, 'dev')
    : normalizedPath;
}

export function getUserDataRuntimeManifestPath(
  userDataPath = resolveScriptUserDataPath(),
  env = process.env,
) {
  return path.join(resolveRuntimeManifestDataScopePath(userDataPath, env), RUNTIME_MANIFEST_FILE);
}

export function resolveBundledRuntimeManifestCandidates(cwd = process.cwd()) {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(cwd, 'resources', RUNTIME_MANIFEST_FILE),
    path.resolve(moduleDirectory, '../resources', RUNTIME_MANIFEST_FILE),
  ];
}

export function getBundledRuntimeManifestPath(cwd = process.cwd()) {
  const candidates = resolveBundledRuntimeManifestCandidates(cwd);
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Runtime manifest was not found. Checked: ${candidates.join(', ')}`);
  }

  return match;
}

export function ensureRuntimeManifestPath(userDataPath = resolveScriptUserDataPath(), cwd = process.cwd(), env = process.env) {
  const targetPath = getUserDataRuntimeManifestPath(userDataPath, env);
  const sourcePath = getBundledRuntimeManifestPath(cwd);
  const sourceContent = fs.readFileSync(sourcePath, 'utf8');
  const dataScopePath = resolveRuntimeManifestDataScopePath(userDataPath, env);
  const materializedContent = materializeRuntimeManifestContent(
    sourceContent,
    dataScopePath,
    path.dirname(sourcePath),
  );
  const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;

  if (currentContent !== materializedContent) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, materializedContent, 'utf8');
  }

  ensureBundledRuntimeTemplates(userDataPath, cwd, env);
  return targetPath;
}

export function ensureBundledRuntimeTemplates(
  userDataPath = resolveScriptUserDataPath(),
  cwd = process.cwd(),
  env = process.env,
) {
  const sourcePath = getBundledRuntimeManifestPath(cwd);
  const manifest = load(fs.readFileSync(sourcePath, 'utf8'));
  if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') {
    throw new Error('Bundled runtime manifest must be a YAML object.');
  }

  materializeBundledRuntimeTemplates(
    manifest,
    resolveRuntimeManifestDataScopePath(userDataPath, env),
    path.dirname(sourcePath),
  );
}

function materializeBundledRuntimeTemplates(manifest, dataScopePath, manifestDirectory) {
  if (!manifestDirectory || !Array.isArray(manifest.components)) {
    return;
  }

  const targetDirectory = path.join(path.resolve(dataScopePath), 'templates');
  for (const component of manifest.components) {
    const componentRecord = asRecord(component);
    if (!componentRecord || readString(componentRecord.type) !== 'bundled-runtime') {
      continue;
    }

    const componentName = readString(componentRecord.name);
    if (!componentName) {
      continue;
    }

    const sourceDirectory = path.resolve(
      manifestDirectory,
      'components',
      'bundled',
      componentName,
      'current',
      'templates',
    );
    if (fs.existsSync(sourceDirectory)) {
      materializeTemplateDirectory(sourceDirectory, targetDirectory);
      continue;
    }

    const fallbackTemplatePath = path.resolve(
      manifestDirectory,
      'templates',
      `${componentName}-config.yaml`,
    );
    if (fs.existsSync(fallbackTemplatePath)) {
      materializeTemplateFile(
        fallbackTemplatePath,
        path.join(targetDirectory, path.basename(fallbackTemplatePath)),
      );
    }
  }
}

function materializeTemplateDirectory(sourceDirectory, targetDirectory) {
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    materializeTemplateFile(
      path.join(sourceDirectory, entry.name),
      path.join(targetDirectory, entry.name),
    );
  }
}

function materializeTemplateFile(sourceTemplatePath, targetTemplatePath) {
  const sourceTemplateContent = fs.readFileSync(sourceTemplatePath);
  const targetTemplateContent = fs.existsSync(targetTemplatePath)
    ? fs.readFileSync(targetTemplatePath)
    : null;

  if (targetTemplateContent && Buffer.compare(sourceTemplateContent, targetTemplateContent) === 0) {
    return;
  }

  fs.mkdirSync(path.dirname(targetTemplatePath), { recursive: true });
  fs.writeFileSync(targetTemplatePath, sourceTemplateContent);
}

export function readRuntimeManifestStore(options = {}) {
  const manifestPath = options.manifestPath
    ? path.resolve(options.manifestPath)
    : ensureRuntimeManifestPath(options.userDataPath, options.cwd);
  const parsed = load(fs.readFileSync(manifestPath, 'utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`Runtime manifest ${manifestPath} must be a YAML object.`);
  }

  return parsed;
}

export function readRuntimeManifestRoot(options = {}) {
  return readRuntimeManifestStore(options);
}

export function readRuntimeManifestSection(sectionName, options = {}) {
  const manifest = readRuntimeManifestStore(options);
  const section = resolveRuntimeManifestSection(manifest, sectionName);
  if (!section || Array.isArray(section) || typeof section !== 'object') {
    throw new Error(`Runtime manifest section "${String(sectionName)}" is missing or invalid.`);
  }

  return section;
}

function resolveRuntimeManifestSection(manifest, sectionName) {
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

function synthesizeDesktopRuntimeSection(manifest) {
  const runtime = asRecord(manifest.runtime);
  const paths = asRecord(manifest.paths);
  const desktopExtensions = asRecord(manifest.desktopExtensions);
  const distribution = asRecord(desktopExtensions?.distribution);
  const programHomes = asRecord(distribution?.programHomes);
  const nodeRuntime = normalizeRelativePath(readString(paths?.nodeRuntime)) || 'components/node/runtime';
  const dotnetRuntime = normalizeRelativePath(readString(paths?.dotnetRuntime)) || 'components/dotnet/runtime';
  const runtimeDataRelativePath = normalizeRelativePath(readString(distribution?.runtimeDataRelativePath)) || 'runtimeData';

  return {
    schemaVersion: 1,
    runtimeVersion: readString(runtime?.version) || '0.1.0',
    programHomes: {
      development: readString(programHomes?.development) || 'resources',
      packaged: readString(programHomes?.packaged) || 'extra/runtime',
    },
    env: {
      programHome: 'HAGICODE_RUNTIME_HOME',
      dataHome: 'HAGICODE_RUNTIME_DATA_HOME',
    },
    dataHome: {
      defaultRelativePath: runtimeDataRelativePath,
      shared: {
        config: normalizeRelativePath(readString(paths?.config)) || 'config',
        logs: normalizeRelativePath(readString(paths?.logs)) || 'logs',
        data: normalizeRelativePath(readString(paths?.data)) || 'data',
        state: normalizeRelativePath(readString(paths?.stateFile)) || 'state.json',
      },
    },
    components: {
      dotnet: {
        relativePath: `${dotnetRuntime}/{platform}`,
      },
      node: {
        relativePath: nodeRuntime,
      },
    },
    services: {},
    npmSync: asRecord(manifest.npmSync) || undefined,
  };
}

function normalizeRelativePath(value) {
  const normalized = value?.trim().replace(/\\/gu, '/').replace(/^\.\/+/u, '');
  return normalized || undefined;
}

function readString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asRecord(value) {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? value
    : null;
}

export function materializeRuntimeManifestContent(manifestContent, dataScopePath, manifestDirectory) {
  const parsed = load(manifestContent);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Bundled runtime manifest must be a YAML object.');
  }

  const manifest = parsed;
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

function rebaseManifestLifecycleScripts(manifest, manifestDirectory) {
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

export function serializeYaml(value) {
  return dump(value, {
    noRefs: true,
    lineWidth: 120,
  });
}
