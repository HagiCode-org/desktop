type TelemetryBridge = NonNullable<typeof window.electronAPI.cloudTelemetry>;

export const telemetry: TelemetryBridge = {
  status: () => window.electronAPI.cloudTelemetry?.status() ?? Promise.resolve(null),
  error: (error, properties) => window.electronAPI.cloudTelemetry?.error(error, properties) ?? Promise.resolve(),
  event: (name, properties) => window.electronAPI.cloudTelemetry?.event(name, properties) ?? Promise.resolve(),
  performance: (name, properties) => window.electronAPI.cloudTelemetry?.performance(name, properties) ?? Promise.resolve(),
  identify: (id) => window.electronAPI.cloudTelemetry?.identify(id) ?? Promise.resolve(),
  heartbeat: (properties) => window.electronAPI.cloudTelemetry?.heartbeat(properties) ?? Promise.resolve(),
};

export function installRendererTelemetry(): () => void {
  const onError = (event: ErrorEvent) => { void telemetry.error(event.error ?? event.message); };
  const onRejection = (event: PromiseRejectionEvent) => { void telemetry.error(event.reason); };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
