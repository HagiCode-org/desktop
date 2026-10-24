import type { ProcessInfo } from './web-service-manager.js';
import { isShallowEqualRecord } from '../shared/shallow-equal.js';

export interface WebServiceStatusSinks {
  /** Sends the payload to the renderer over IPC. */
  sendToRenderer(info: ProcessInfo): void;
  /** Refreshes the tray status, the menu and the service URL. */
  applyToShell(info: ProcessInfo): void;
}

export interface PublishWebServiceStatusOptions {
  /** Publish even when the payload equals the last published one. */
  force?: boolean;
}

export interface WebServiceStatusPublisher {
  publish(info: ProcessInfo, options?: PublishWebServiceStatusOptions): boolean;
}

export function createWebServiceStatusPublisher(sinks: WebServiceStatusSinks): WebServiceStatusPublisher {
  let lastPublished: ProcessInfo | null = null;

  return {
    publish(info, options = {}) {
      if (!options.force && lastPublished && isShallowEqualRecord(lastPublished, info)) {
        return false;
      }

      lastPublished = info;
      sinks.sendToRenderer(info);
      sinks.applyToShell(info);
      return true;
    },
  };
}

export interface WebServiceStatusPollerDeps {
  intervalMs: number;
  canPoll: () => boolean;
  readStatus: () => Promise<ProcessInfo>;
  publisher: WebServiceStatusPublisher;
  onError: (error: unknown) => void;
}

/**
 * Starts the managed web-service status loop and returns a function that stops it.
 */
export function startWebServiceStatusPoller(deps: WebServiceStatusPollerDeps): () => void {
  let inFlight = false;

  const timer = setInterval(async () => {
    if (!deps.canPoll() || inFlight) return;

    inFlight = true;
    try {
      deps.publisher.publish(await deps.readStatus());
    } catch (error) {
      deps.onError(error);
    } finally {
      inFlight = false;
    }
  }, deps.intervalMs);

  return () => clearInterval(timer);
}
