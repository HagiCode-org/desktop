import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pm2';
}

async function ensureSymlinkAlias(input: {
  targetPath: string;
  label: string;
  aliasRoot: string;
  type: 'dir' | 'file';
}): Promise<string> {
  const { targetPath, label, aliasRoot, type } = input;
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
  await fs.symlink(targetPath, aliasPath, process.platform === 'win32' ? 'junction' : type);
  return aliasPath;
}

export async function ensureNoSpacePathAlias(targetPath: string, label: string): Promise<string> {
  if (process.platform === 'win32') {
    return targetPath;
  }
  if (!targetPath.includes(' ')) {
    return targetPath;
  }

  const stats = await fs.lstat(targetPath);
  return ensureSymlinkAlias({
    targetPath,
    label,
    aliasRoot: path.join('/tmp', 'hagicode-desktop-path-alias'),
    type: stats.isDirectory() ? 'dir' : 'file',
  });
}

export async function ensurePm2HomeAlias(targetPath: string, label: string): Promise<string> {
  await fs.mkdir(targetPath, { recursive: true });
  if (!targetPath.includes(' ')) {
    return targetPath;
  }

  return ensureSymlinkAlias({
    targetPath,
    label,
    aliasRoot: process.platform === 'win32'
    ? path.join(path.parse(targetPath).root, 'hagicode-desktop-pm2-home')
    : path.join('/tmp', 'hagicode-desktop-pm2-home'),
    type: 'dir',
  });
}
