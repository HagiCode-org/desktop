import type { StartResult } from './manifest-reader.js';
import {
  buildStartupCompatibilityDiagnosticLine,
  createStartupCompatibilitySnapshot,
  getRecordedStartupCompatibilityDecision,
  type StartupCompatibilitySnapshot,
} from './linux-startup-compatibility.js';

export interface StartupFailurePayload {
  summary: string;
  log: string;
  port: number;
  timestamp: string;
  truncated: boolean;
  startupCompatibility?: StartupCompatibilitySnapshot;
}

export function buildStartupFailurePayload(result: StartResult, fallbackPort: number): StartupFailurePayload {
  const summary =
    result.parsedResult.errorMessage ||
    result.resultSession.errorMessage ||
    'Failed to start web service';
  const compatibilityDecision = getRecordedStartupCompatibilityDecision();
  const compatibilityLine = buildStartupCompatibilityDiagnosticLine(compatibilityDecision);
  const logOutput = result.parsedResult.rawOutput?.trim() || summary;
  const enrichedLogOutput = compatibilityLine ? `${compatibilityLine}\n${logOutput}` : logOutput;
  const truncated = enrichedLogOutput.includes('[Startup log truncated');

  return {
    summary,
    log: enrichedLogOutput,
    port: result.port ?? result.parsedResult.port ?? result.resultSession.port ?? fallbackPort,
    timestamp: result.resultSession.timestamp || new Date().toISOString(),
    truncated,
    startupCompatibility: compatibilityDecision
      ? createStartupCompatibilitySnapshot(compatibilityDecision)
      : undefined,
  };
}
