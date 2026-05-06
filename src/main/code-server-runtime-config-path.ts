import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveCodeServerRuntimeConfigCandidates(
  moduleDirectory: string = path.dirname(fileURLToPath(import.meta.url)),
  cwd: string = process.cwd(),
): string[] {
  return [
    path.resolve(cwd, 'resources', 'code-server-runtime', 'runtime-manifest.json'),
    path.resolve(moduleDirectory, '../../resources/code-server-runtime/runtime-manifest.json'),
  ];
}

export function getCodeServerRuntimeConfigPath(options?: {
  cwd?: string;
  moduleDirectory?: string;
  existsSync?: (targetPath: string) => boolean;
}): string {
  const candidates = resolveCodeServerRuntimeConfigCandidates(
    options?.moduleDirectory,
    options?.cwd,
  );
  const existsSync = options?.existsSync ?? fs.existsSync;
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(`Vendored code-server runtime manifest was not found. Checked: ${candidates.join(', ')}`);
  }

  return match;
}
