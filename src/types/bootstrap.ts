export type DesktopBootstrapStatus = 'loading' | 'ready' | 'error';

export type DesktopBootstrapStage =
  | 'bootstrap-start'
  | 'config-ready'
  | 'data-directory-ready'
  | 'preload-bridge'
  | 'renderer-shell'
  | 'shell-ready';

export type DataDirectorySource = 'default' | 'configured' | 'fallback-default';

export type DataDirectoryDiagnosticCode =
  | 'invalid-path'
  | 'mkdir-failed'
  | 'write-test-failed'
  | 'apply-failed'
  | 'unknown';

export type DataDirectoryDiagnosticOperation =
  | 'normalize'
  | 'mkdir'
  | 'write-test'
  | 'apply';

export interface DataDirectoryDiagnostic {
  code: DataDirectoryDiagnosticCode;
  operation: DataDirectoryDiagnosticOperation;
  summary: string;
  detail?: string;
  requestedPath: string | null;
  normalizedPath: string;
  fallbackUsed: boolean;
  fallbackPath?: string;
}

export interface BootstrapDataDirectoryContext {
  source: DataDirectorySource;
  requestedPath: string | null;
  normalizedPath: string;
  defaultPath: string;
  existed: boolean;
  created: boolean;
  writable: boolean;
  usingDefault: boolean;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface BootstrapRecoveryActions {
  canRetry: boolean;
  canRestoreDefault: boolean;
  canOpenDesktopLogs: boolean;
}

export interface DesktopBootstrapSnapshot {
  status: DesktopBootstrapStatus;
  stage: DesktopBootstrapStage;
  summary: string;
  details?: string;
  dataDirectory: BootstrapDataDirectoryContext | null;
  diagnostics: DataDirectoryDiagnostic[];
  recovery: BootstrapRecoveryActions;
  generatedAt: string;
}

export interface DataDirectoryValidationPayload {
  isValid: boolean;
  message: string;
  warnings?: string[];
  normalizedPath?: string;
  diagnostic?: DataDirectoryDiagnostic;
}

export interface DataDirectoryMutationResult {
  success: boolean;
  path?: string;
  error?: string;
  diagnostic?: DataDirectoryDiagnostic;
}
