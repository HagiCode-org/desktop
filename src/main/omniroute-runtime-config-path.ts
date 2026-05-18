import {
  getRuntimeManifestPath,
  resolveRuntimeManifestCandidates,
  type ResolveRuntimeManifestPathOptions,
} from './runtime-manifest-store.js';

export function resolveOmniRouteRuntimeConfigCandidates(
  moduleDirectory?: string,
  cwd?: string,
  userDataPath?: string | null,
): string[] {
  return resolveRuntimeManifestCandidates({ moduleDirectory, cwd, userDataPath });
}

export function getOmniRouteRuntimeConfigPath(options?: ResolveRuntimeManifestPathOptions): string {
  return getRuntimeManifestPath(options);
}
