export const OMNIROUTE_DEFAULT_PORT = 36988;
export const OMNIROUTE_PROCESS_NAME = 'desktop-omniroute-service';

export type OmniRouteLifecycleAction = 'start' | 'stop' | 'restart';
export type OmniRouteOverallStatus = 'running' | 'stopped' | 'partial' | 'error';
export type OmniRouteProcessStatus = 'online' | 'stopped' | 'errored' | 'unknown';
export type OmniRouteLogTarget = 'service-out' | 'service-error';
export type OmniRoutePathTarget = 'config' | 'data' | 'logs';

export interface OmniRouteManagedPaths {
  root: string;
  config: string;
  data: string;
  logs: string;
  runtime: string;
  envFile: string;
  ecosystemFile: string;
}

export interface OmniRouteProcessSnapshot {
  name: string;
  status: OmniRouteProcessStatus;
  pid: number | null;
  restartCount: number | null;
  uptime: number | null;
}

export interface OmniRouteConfigSnapshot {
  port: number;
  baseUrl: string;
}

export interface OmniRouteStatusSnapshot {
  status: OmniRouteOverallStatus;
  config: OmniRouteConfigSnapshot;
  paths: OmniRouteManagedPaths;
  processes: OmniRouteProcessSnapshot[];
  pm2Available: boolean;
  pm2ExecutablePath: string | null;
  error?: string;
  generatedAt: string;
}

export interface OmniRouteLifecycleResult {
  success: boolean;
  action: OmniRouteLifecycleAction;
  status: OmniRouteStatusSnapshot;
  error?: string;
}

export interface OmniRouteConfigUpdatePayload {
  port: number;
}

export interface OmniRouteConfigUpdateResult {
  success: boolean;
  config: OmniRouteConfigSnapshot;
  status: OmniRouteStatusSnapshot;
  error?: string;
}

export interface OmniRouteLogReadRequest {
  target: OmniRouteLogTarget;
  maxLines?: number;
}

export interface OmniRouteLogReadResult {
  target: OmniRouteLogTarget;
  path: string;
  exists: boolean;
  lines: string[];
}

export interface OmniRoutePathOpenResult {
  success: boolean;
  target: OmniRoutePathTarget;
  path: string;
  error?: string;
}

export interface OmniRouteBridge {
  getStatus: () => Promise<OmniRouteStatusSnapshot>;
  start: () => Promise<OmniRouteLifecycleResult>;
  stop: () => Promise<OmniRouteLifecycleResult>;
  restart: () => Promise<OmniRouteLifecycleResult>;
  getConfig: () => Promise<OmniRouteConfigSnapshot>;
  setConfig: (payload: OmniRouteConfigUpdatePayload) => Promise<OmniRouteConfigUpdateResult>;
  readLog: (request: OmniRouteLogReadRequest) => Promise<OmniRouteLogReadResult>;
  openPath: (target: OmniRoutePathTarget) => Promise<OmniRoutePathOpenResult>;
  onStatusChange: (callback: (status: OmniRouteStatusSnapshot) => void) => () => void;
}

export const omniRouteChannels = {
  status: 'omniroute:status',
  start: 'omniroute:start',
  stop: 'omniroute:stop',
  restart: 'omniroute:restart',
  getConfig: 'omniroute:config:get',
  setConfig: 'omniroute:config:set',
  readLog: 'omniroute:log:read',
  openPath: 'omniroute:path:open',
  statusChanged: 'omniroute:status-changed',
} as const;
