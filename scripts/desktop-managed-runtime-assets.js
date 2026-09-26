import fs from 'node:fs';
import path from 'node:path';

export function findDesktopManagedNodePm2Assets(runtimeRoot) {
  return [
    path.join(runtimeRoot, 'components', 'node'),
    path.join(runtimeRoot, 'npm-pm2'),
  ].filter((assetPath) => fs.existsSync(assetPath));
}

export function resolvePackagedRuntimeRootFromDotnetRoot(dotnetRuntimeRoot) {
  return path.resolve(dotnetRuntimeRoot, '..', '..', '..', '..', '..');
}
