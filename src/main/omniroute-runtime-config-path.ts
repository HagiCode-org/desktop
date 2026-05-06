import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveOmniRouteRuntimeConfigCandidates(
  moduleDirectory: string = path.dirname(fileURLToPath(import.meta.url)),
  cwd: string = process.cwd(),
): string[] {
  return [
    path.resolve(cwd, 'resources', 'omniroute', 'runtime-manifest.json'),
    path.resolve(moduleDirectory, '../../resources/omniroute/runtime-manifest.json'),
  ];
}

export function getOmniRouteRuntimeConfigPath(options?: {
  cwd?: string;
  moduleDirectory?: string;
  existsSync?: (targetPath: string) => boolean;
}): string {
  const candidates = resolveOmniRouteRuntimeConfigCandidates(
    options?.moduleDirectory,
    options?.cwd,
  );
  const existsSync = options?.existsSync ?? fs.existsSync;
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(`Vendored OmniRoute runtime manifest was not found. Checked: ${candidates.join(', ')}`);
  }

  return match;
}
