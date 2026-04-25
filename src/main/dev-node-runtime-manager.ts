import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import log from 'electron-log';
import {
  detectNodeRuntimePlatform,
  getGovernedNodeRuntimeMajor,
  nodeVersionMatchesGovernedMajor,
  readPinnedNodeRuntimeConfig,
  type EmbeddedNodeRuntimeConfig,
} from './embedded-node-runtime-config.js';

const execFileAsync = promisify(execFile);

export const DEV_NODE_RUNTIME_ROOT = path.join('.runtime', 'node-dev');
export const DEV_NODE_RUNTIME_METADATA_FILE = 'runtime-metadata.json';

export interface DevNodeRuntimeMetadata {
  schemaVersion: number;
  owner: 'hagicode-desktop';
  source: 'bundled-dev';
  nodeVersion: string;
  channelVersion?: string;
  platform: string;
  arch: string;
  installRoot: string;
  nodeExecutablePath: string;
  npmExecutablePath?: string;
  corepackExecutablePath?: string;
  npmGlobalRoot?: string;
  npmCacheRoot?: string;
  installedAt: string;
  toolchain?: {
    node?: { available?: boolean; version?: string | null; executablePath?: string };
    npm?: { available?: boolean; version?: string | null; executablePath?: string };
    corepack?: { available?: boolean; version?: string | null; executablePath?: string };
    valid?: boolean;
  };
}

export interface DevNodeRuntimeStatus {
  available: boolean;
  source: 'bundled-dev';
  platform: string;
  runtimeRoot: string;
  metadataPath: string;
  installRoot?: string;
  nodeExecutablePath?: string;
  npmExecutablePath?: string;
  nodeVersion?: string;
  npmVersion?: string;
  errors: string[];
  metadata?: DevNodeRuntimeMetadata;
}

function isExecutable(targetPath: string): boolean {
  try {
    fsSync.accessSync(targetPath, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function requiresExecutableBit(): boolean {
  return process.platform !== 'win32';
}

async function probeVersion(executablePath: string, args: string[]): Promise<string> {
  const result = await execFileAsync(executablePath, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  });
  return String(result.stdout).trim();
}

export class DevNodeRuntimeManager {
  private readonly runtimeConfig: EmbeddedNodeRuntimeConfig;
  private readonly projectRoot: string;

  constructor(options?: { projectRoot?: string; runtimeConfig?: EmbeddedNodeRuntimeConfig }) {
    this.projectRoot = options?.projectRoot ?? process.cwd();
    this.runtimeConfig = options?.runtimeConfig ?? readPinnedNodeRuntimeConfig();
  }

  isSourceMode(): boolean {
    return !app.isPackaged;
  }

  getRuntimeRoot(): string {
    return path.join(this.projectRoot, DEV_NODE_RUNTIME_ROOT);
  }

  getMetadataPath(): string {
    return path.join(this.getRuntimeRoot(), DEV_NODE_RUNTIME_METADATA_FILE);
  }

  async verify(): Promise<DevNodeRuntimeStatus> {
    const platform = detectNodeRuntimePlatform();
    const runtimeRoot = this.getRuntimeRoot();
    const metadataPath = this.getMetadataPath();
    const governedNodeMajor = getGovernedNodeRuntimeMajor(this.runtimeConfig);
    const errors: string[] = [];

    if (!this.isSourceMode()) {
      return {
        available: false,
        source: 'bundled-dev',
        platform,
        runtimeRoot,
        metadataPath,
        errors: ['development Node runtime is only considered in source mode'],
      };
    }

    let metadata: DevNodeRuntimeMetadata | null = null;
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as DevNodeRuntimeMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn('[DevNodeRuntimeManager] Failed to read development Node metadata:', metadataPath, error);
      }
      errors.push(`${DEV_NODE_RUNTIME_METADATA_FILE} is missing or invalid`);
    }

    if (!metadata) {
      return { available: false, source: 'bundled-dev', platform, runtimeRoot, metadataPath, errors };
    }

    if (metadata.owner !== 'hagicode-desktop' || metadata.source !== 'bundled-dev') {
      errors.push('metadata owner/source is not hagicode-desktop bundled-dev');
    }
    if (metadata.platform !== platform) {
      errors.push(`metadata platform expected ${platform} but found ${metadata.platform || 'missing'}`);
    }
    if (metadata.arch !== process.arch) {
      errors.push(`metadata architecture expected ${process.arch} but found ${metadata.arch || 'missing'}`);
    }
    if (!nodeVersionMatchesGovernedMajor(metadata.nodeVersion, this.runtimeConfig)) {
      errors.push(`Node major version expected ${governedNodeMajor} but found ${metadata.nodeVersion || 'missing'}`);
    }
    if (!metadata.installRoot || !path.isAbsolute(metadata.installRoot)) {
      errors.push('metadata installRoot must be an absolute path');
    }
    if (!metadata.nodeExecutablePath || !path.isAbsolute(metadata.nodeExecutablePath)) {
      errors.push('metadata nodeExecutablePath must be an absolute path');
    }

    let nodeVersion: string | undefined;
    let npmVersion: string | undefined;
    if (metadata.nodeExecutablePath) {
      if (!fsSync.existsSync(metadata.nodeExecutablePath)) {
        errors.push(`Node executable is missing at ${metadata.nodeExecutablePath}`);
      } else if (requiresExecutableBit() && !isExecutable(metadata.nodeExecutablePath)) {
        errors.push(`Node executable is not executable at ${metadata.nodeExecutablePath}`);
      } else {
        try {
          nodeVersion = (await probeVersion(metadata.nodeExecutablePath, ['--version'])).replace(/^v/, '');
          if (!nodeVersionMatchesGovernedMajor(nodeVersion, this.runtimeConfig)) {
            errors.push(`Node probe expected major ${governedNodeMajor} but found ${nodeVersion}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Node executable probe failed: ${message}`);
        }
      }
    }

    if (metadata.npmExecutablePath) {
      if (!fsSync.existsSync(metadata.npmExecutablePath)) {
        errors.push(`npm executable is missing at ${metadata.npmExecutablePath}`);
      } else if (requiresExecutableBit() && !isExecutable(metadata.npmExecutablePath)) {
        errors.push(`npm executable is not executable at ${metadata.npmExecutablePath}`);
      } else {
        try {
          npmVersion = await probeVersion(metadata.npmExecutablePath, ['--version']);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`npm executable probe failed: ${message}`);
        }
      }
    }

    return {
      available: errors.length === 0,
      source: 'bundled-dev',
      platform,
      runtimeRoot,
      metadataPath,
      installRoot: metadata.installRoot,
      nodeExecutablePath: metadata.nodeExecutablePath,
      npmExecutablePath: metadata.npmExecutablePath,
      nodeVersion,
      npmVersion,
      errors,
      metadata,
    };
  }
}
