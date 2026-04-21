import fs from 'node:fs';
import path from 'node:path';

interface ResolveWindowIconPathOptions {
  appRootPath: string;
  isPackaged?: boolean;
  resourcesPath?: string;
  existsSync?: (targetPath: string) => boolean;
}

export function resolveWindowIconPath(options: ResolveWindowIconPathOptions): string {
  const existsSync = options.existsSync ?? fs.existsSync;
  const candidates: string[] = [];

  if (options.isPackaged && options.resourcesPath) {
    candidates.push(path.join(options.resourcesPath, 'icon.png'));
  }

  candidates.push(path.join(options.appRootPath, 'resources', 'icon.png'));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}
