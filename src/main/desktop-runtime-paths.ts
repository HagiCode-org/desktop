import path from 'node:path';
import { resolveDesktopCanonicalRuntimeDataRoot } from './runtime-data-root.js';
import {
  getRuntimeManifestPath,
  readRuntimeManifestSection,
  resolveRuntimeManifestCandidates,
  type ResolveRuntimeManifestPathOptions,
} from './runtime-manifest-store.js';

export type DesktopRuntimeComponentId = 'dotnet' | 'node';
export type DesktopRuntimeServiceId = never;

export interface DesktopRuntimeManifest {
  schemaVersion: number;
  runtimeVersion: string;
  programHomes: {
    development: string;
    packaged: string;
  };
  env: {
    programHome: string;
    dataHome: string;
  };
  dataHome: {
    defaultRelativePath: string;
    shared: {
      config: string;
      logs: string;
      data: string;
      state: string;
    };
  };
  components: Record<DesktopRuntimeComponentId, { relativePath: string }>;
  services: Record<DesktopRuntimeServiceId, { dataRelativePath: string }>;
  npmSync?: {
    packages: Record<string, { version: string; target?: string }>;
  };
}

export interface ResolveDesktopRuntimeProgramHomeOptions {
  cwd?: string;
  resourcesPath?: string;
  isPackaged?: boolean;
  overrideRoot?: string | null;
}

export interface ResolveDesktopRuntimeDataHomeOptions {
  userDataPath?: string;
  homeDirectory?: string;
  overrideRoot?: string | null;
}

function resolvePortableAbsolutePath(value: string): string | undefined {
  if (path.posix.isAbsolute(value)) {
    return path.posix.normalize(value);
  }

  if (path.win32.isAbsolute(value)) {
    return path.win32.normalize(value);
  }

  return undefined;
}

function resolvePortablePath(pathValue: string, baseRoot?: string): string {
  const absolutePath = resolvePortableAbsolutePath(pathValue);
  if (absolutePath) {
    return absolutePath;
  }

  if (!baseRoot) {
    return path.resolve(pathValue);
  }

  if (path.posix.isAbsolute(baseRoot)) {
    return path.posix.resolve(baseRoot, pathValue);
  }

  if (path.win32.isAbsolute(baseRoot)) {
    return path.win32.resolve(baseRoot, pathValue);
  }

  return path.resolve(baseRoot, pathValue);
}

function getPathModuleForRoot(rootPath: string): typeof path.posix | typeof path.win32 | typeof path {
  if (path.posix.isAbsolute(rootPath)) {
    return path.posix;
  }

  if (path.win32.isAbsolute(rootPath)) {
    return path.win32;
  }

  return path;
}

export function resolveDesktopRuntimeManifestCandidates(
  moduleDirectory?: string,
  cwd?: string,
  userDataPath?: string | null,
): string[] {
  return resolveRuntimeManifestCandidates({ moduleDirectory, cwd, userDataPath });
}

export function getDesktopRuntimeManifestPath(options?: ResolveRuntimeManifestPathOptions): string {
  return getRuntimeManifestPath(options);
}

export function readDesktopRuntimeManifest(
  options: ResolveRuntimeManifestPathOptions = {},
): DesktopRuntimeManifest {
  return readRuntimeManifestSection<DesktopRuntimeManifest>('desktopRuntime', options);
}

export function resolveDesktopRuntimeProgramHome(
  options: ResolveDesktopRuntimeProgramHomeOptions = {},
): string {
  const overrideRoot = options.overrideRoot?.trim();
  if (overrideRoot) {
    return resolvePortablePath(overrideRoot);
  }

  const manifest = readDesktopRuntimeManifest();
  const isPackaged = options.isPackaged ?? false;
  const baseRoot = isPackaged
    ? (options.resourcesPath ?? process.resourcesPath)
    : (options.cwd ?? process.cwd());
  const relativeRoot = isPackaged
    ? manifest.programHomes.packaged
    : manifest.programHomes.development;

  return resolvePortablePath(relativeRoot, baseRoot);
}

export function resolveDesktopRuntimeDataHome(
  options: ResolveDesktopRuntimeDataHomeOptions,
): string {
  return resolveDesktopCanonicalRuntimeDataRoot({
    overrideRoot: options.overrideRoot,
    homeDirectory: options.homeDirectory,
  });
}

export function resolveDesktopRuntimeComponentProgramRoot(
  componentId: DesktopRuntimeComponentId,
  programHome: string,
  platform: string,
  manifest: DesktopRuntimeManifest = readDesktopRuntimeManifest(),
): string {
  const pathModule = getPathModuleForRoot(programHome);
  return pathModule.join(
    resolveDesktopRuntimeComponentContainerRoot(componentId, programHome, platform, manifest),
    ...resolveDesktopRuntimeComponentRuntimeSuffix(componentId),
  );
}

export function resolveDesktopRuntimeComponentContainerRoot(
  componentId: DesktopRuntimeComponentId,
  programHome: string,
  platform: string,
  manifest: DesktopRuntimeManifest = readDesktopRuntimeManifest(),
): string {
  const component = manifest.components[componentId];
  if (!component) {
    throw new Error(`Desktop runtime component is not configured: ${componentId}`);
  }

  return getPathModuleForRoot(programHome).join(
    programHome,
    component.relativePath.split('{platform}').join(platform),
  );
}

function resolveDesktopRuntimeComponentRuntimeSuffix(componentId: DesktopRuntimeComponentId): string[] {
  if (componentId === 'node') {
    return [];
  }

  return ['current'];
}

export function resolveDesktopRuntimeSharedDataPaths(
  runtimeDataHome: string,
  manifest: DesktopRuntimeManifest = readDesktopRuntimeManifest(),
): {
  root: string;
  config: string;
  logs: string;
  data: string;
  state: string;
} {
  return {
    root: runtimeDataHome,
    config: path.join(runtimeDataHome, manifest.dataHome.shared.config),
    logs: path.join(runtimeDataHome, manifest.dataHome.shared.logs),
    data: path.join(runtimeDataHome, manifest.dataHome.shared.data),
    state: path.join(runtimeDataHome, manifest.dataHome.shared.state),
  };
}
