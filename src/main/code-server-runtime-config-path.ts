import {
  getRuntimeManifestPath,
  resolveRuntimeManifestCandidates,
  type ResolveRuntimeManifestPathOptions,
} from './runtime-manifest-store.js';

export function resolveCodeServerRuntimeConfigCandidates(
  moduleDirectory?: string,
  cwd?: string,
  userDataPath?: string | null,
): string[] {
  return resolveRuntimeManifestCandidates({ moduleDirectory, cwd, userDataPath });
}

export function getCodeServerRuntimeConfigPath(options?: ResolveRuntimeManifestPathOptions): string {
  return getRuntimeManifestPath(options);
}
