import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DesktopRuntimeComponentId = 'dotnet' | 'node' | 'code-server' | 'omniroute';
export type DesktopRuntimeServiceId = Extract<DesktopRuntimeComponentId, 'code-server' | 'omniroute'>;

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
}

export interface ResolveDesktopRuntimeProgramHomeOptions {
  cwd?: string;
  resourcesPath?: string;
  isPackaged?: boolean;
  overrideRoot?: string | null;
}

export interface ResolveDesktopRuntimeDataHomeOptions {
  userDataPath: string;
  overrideRoot?: string | null;
}

let cachedManifest: DesktopRuntimeManifest | null = null;

export function resolveDesktopRuntimeManifestCandidates(
  moduleDirectory: string = path.dirname(fileURLToPath(import.meta.url)),
  cwd: string = process.cwd(),
): string[] {
  return [
    path.resolve(cwd, 'resources', 'desktop-runtime', 'runtime-manifest.json'),
    path.resolve(moduleDirectory, '../../resources/desktop-runtime/runtime-manifest.json'),
  ];
}

export function getDesktopRuntimeManifestPath(options?: {
  cwd?: string;
  moduleDirectory?: string;
  existsSync?: (targetPath: string) => boolean;
}): string {
  const existsSync = options?.existsSync ?? fs.existsSync;
  const candidates = resolveDesktopRuntimeManifestCandidates(options?.moduleDirectory, options?.cwd);
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(`Desktop runtime manifest was not found. Checked: ${candidates.join(', ')}`);
  }

  return match;
}

export function readDesktopRuntimeManifest(
  manifestPath: string = getDesktopRuntimeManifestPath(),
): DesktopRuntimeManifest {
  if (cachedManifest && manifestPath === getDesktopRuntimeManifestPath()) {
    return cachedManifest;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DesktopRuntimeManifest;
  cachedManifest = manifest;
  return manifest;
}

export function resolveDesktopRuntimeProgramHome(
  options: ResolveDesktopRuntimeProgramHomeOptions = {},
): string {
  const overrideRoot = options.overrideRoot?.trim();
  if (overrideRoot) {
    return path.resolve(overrideRoot);
  }

  const manifest = readDesktopRuntimeManifest();
  const isPackaged = options.isPackaged ?? false;
  const baseRoot = isPackaged
    ? (options.resourcesPath ?? process.resourcesPath)
    : (options.cwd ?? process.cwd());
  const relativeRoot = isPackaged
    ? manifest.programHomes.packaged
    : manifest.programHomes.development;

  return path.resolve(baseRoot, relativeRoot);
}

export function resolveDesktopRuntimeDataHome(
  options: ResolveDesktopRuntimeDataHomeOptions,
): string {
  const overrideRoot = options.overrideRoot?.trim();
  if (overrideRoot) {
    return path.resolve(overrideRoot);
  }

  const manifest = readDesktopRuntimeManifest();
  return path.join(options.userDataPath, manifest.dataHome.defaultRelativePath);
}

export function resolveDesktopRuntimeComponentProgramRoot(
  componentId: DesktopRuntimeComponentId,
  programHome: string,
  platform: string,
  manifest: DesktopRuntimeManifest = readDesktopRuntimeManifest(),
): string {
  return path.join(
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

  return path.join(programHome, component.relativePath.split('{platform}').join(platform));
}

function resolveDesktopRuntimeComponentRuntimeSuffix(componentId: DesktopRuntimeComponentId): string[] {
  if (componentId === 'node') {
    return [];
  }

  return ['current'];
}

export function resolveDesktopRuntimeServiceDataHome(
  serviceId: DesktopRuntimeServiceId,
  runtimeDataHome: string,
  manifest: DesktopRuntimeManifest = readDesktopRuntimeManifest(),
): string {
  const service = manifest.services[serviceId];
  if (!service) {
    throw new Error(`Desktop runtime service is not configured: ${serviceId}`);
  }

  return path.join(runtimeDataHome, service.dataRelativePath);
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
