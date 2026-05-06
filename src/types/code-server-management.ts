import type { VendoredRuntimeStatusSnapshot } from './dependency-management.js';

export const CODE_SERVER_DEFAULT_PORT = 37667;
export const CODE_SERVER_PROCESS_NAME = 'hagicode-code-server';

export type CodeServerLifecycleAction = 'start' | 'stop' | 'restart' | 'repair';
export type CodeServerOverallStatus = 'running' | 'stopped' | 'missing' | 'damaged' | 'error';
export type CodeServerProcessStatus = 'online' | 'stopped' | 'errored' | 'unknown';
export type CodeServerLogTarget = 'service-out' | 'service-error';
export type CodeServerPathTarget = 'runtime-root' | 'logs' | 'data' | 'extensions';

export interface CodeServerManagedPaths {
  root: string;
  data: string;
  extensions: string;
  logs: string;
  runtime: string;
  ecosystemFile: string;
}

export interface CodeServerConfigSnapshot {
  port: number;
  baseUrl: string;
  password: string;
}

export interface CodeServerConfigUpdatePayload {
  port: number;
  password?: string;
}

export interface CodeServerProcessSnapshot {
  name: string;
  status: CodeServerProcessStatus;
  restartCount: number | null;
}

export interface CodeServerStatusSnapshot {
  status: CodeServerOverallStatus;
  config: CodeServerConfigSnapshot;
  runtime: VendoredRuntimeStatusSnapshot;
  paths: CodeServerManagedPaths;
  pm2Available: boolean;
  pm2ExecutablePath: string | null;
  process: CodeServerProcessSnapshot;
  error?: string;
  generatedAt: string;
}

export interface CodeServerLifecycleResult {
  success: boolean;
  action: CodeServerLifecycleAction;
  status: CodeServerStatusSnapshot;
  error?: string;
}

export interface CodeServerConfigUpdateResult {
  success: boolean;
  config: CodeServerConfigSnapshot;
  status: CodeServerStatusSnapshot;
  error?: string;
}

export interface CodeServerLogReadRequest {
  target: CodeServerLogTarget;
  maxLines?: number;
}

export interface CodeServerLogReadResult {
  target: CodeServerLogTarget;
  path: string;
  exists: boolean;
  lines: string[];
}

export interface CodeServerPathOpenResult {
  success: boolean;
  target: CodeServerPathTarget;
  path: string;
  error?: string;
}

export interface CodeServerBridge {
  getStatus: () => Promise<CodeServerStatusSnapshot>;
  start: () => Promise<CodeServerLifecycleResult>;
  stop: () => Promise<CodeServerLifecycleResult>;
  restart: () => Promise<CodeServerLifecycleResult>;
  repair: () => Promise<CodeServerLifecycleResult>;
  getConfig: () => Promise<CodeServerConfigSnapshot>;
  setConfig: (payload: CodeServerConfigUpdatePayload) => Promise<CodeServerConfigUpdateResult>;
  readLog: (request: CodeServerLogReadRequest) => Promise<CodeServerLogReadResult>;
  openPath: (target: CodeServerPathTarget) => Promise<CodeServerPathOpenResult>;
  onStatusChange: (callback: (status: CodeServerStatusSnapshot) => void) => () => void;
}

export const codeServerChannels = {
  status: 'code-server:status',
  start: 'code-server:start',
  stop: 'code-server:stop',
  restart: 'code-server:restart',
  repair: 'code-server:repair',
  getConfig: 'code-server:config:get',
  setConfig: 'code-server:config:set',
  readLog: 'code-server:log:read',
  openPath: 'code-server:path:open',
  statusChanged: 'code-server:status-changed',
} as const;
