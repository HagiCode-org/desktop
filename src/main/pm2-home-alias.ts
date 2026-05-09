import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pm2';
}

export async function ensurePm2HomeAlias(targetPath: string, label: string): Promise<string> {
  await fs.mkdir(targetPath, { recursive: true });
  if (!targetPath.includes(' ')) {
    return targetPath;
  }

  const aliasRoot = process.platform === 'win32'
    ? path.join(path.parse(targetPath).root, 'hagicode-desktop-pm2-home')
    : path.join('/tmp', 'hagicode-desktop-pm2-home');
  await fs.mkdir(aliasRoot, { recursive: true });

  const digest = createHash('sha256').update(targetPath).digest('hex').slice(0, 12);
  const aliasPath = path.join(aliasRoot, `${sanitizeSegment(label)}-${digest}`);

  try {
    const [existingRealPath, targetRealPath] = await Promise.all([
      fs.realpath(aliasPath),
      fs.realpath(targetPath),
    ]);
    if (existingRealPath === targetRealPath) {
      return aliasPath;
    }
  } catch {
    // Recreate the bridge below when it is missing or stale.
  }

  await fs.rm(aliasPath, { recursive: true, force: true });
  await fs.symlink(targetPath, aliasPath, process.platform === 'win32' ? 'junction' : 'dir');
  return aliasPath;
}
