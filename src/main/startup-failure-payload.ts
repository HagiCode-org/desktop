import type { StartResult } from './manifest-reader.js';

export interface StartupFailurePayload {
  summary: string;
  log: string;
  port: number;
  timestamp: string;
  truncated: boolean;
}

export function buildStartupFailurePayload(result: StartResult, fallbackPort: number): StartupFailurePayload {
  const summary =
    result.parsedResult.errorMessage ||
    result.resultSession.errorMessage ||
    'Failed to start web service';
  const logOutput = result.parsedResult.rawOutput?.trim() || summary;
  const truncated = logOutput.includes('[Startup log truncated');

  return {
    summary,
    log: logOutput,
    port: result.port ?? result.parsedResult.port ?? result.resultSession.port ?? fallbackPort,
    timestamp: result.resultSession.timestamp || new Date().toISOString(),
    truncated,
  };
}
