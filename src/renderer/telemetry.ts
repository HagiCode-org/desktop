import type { TelemetryCatalogEventName, TelemetryEventProperties } from '../shared/telemetry-events.js';

type TelemetryBridge = NonNullable<typeof window.electronAPI.cloudTelemetry>;

export const telemetry: TelemetryBridge = {
  status: () => window.electronAPI.cloudTelemetry?.status() ?? Promise.resolve(null),
  // Takes no arguments: the error object never leaves the renderer. Main reports `renderer_uncaught`.
  error: () => window.electronAPI.cloudTelemetry?.error() ?? Promise.resolve(),
  event: (name, properties) => window.electronAPI.cloudTelemetry?.event(name, properties) ?? Promise.resolve(),
  identify: (id) => window.electronAPI.cloudTelemetry?.identify(id) ?? Promise.resolve(),
};

export function trackEvent<N extends TelemetryCatalogEventName>(
  name: N,
  properties: TelemetryEventProperties<N>,
): void {
  telemetry.event(name, properties).catch(() => undefined);
}

export function installRendererTelemetry(): () => void {
  const onError = () => { void telemetry.error(); };
  const onRejection = () => { void telemetry.error(); };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
