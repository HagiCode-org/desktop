export interface FixedPortStartupDecision {
  canStart: boolean;
  port: number;
  errorMessage?: string;
}

export function evaluateFixedPortStartup(port: number, available: boolean): FixedPortStartupDecision {
  if (available) {
    return {
      canStart: true,
      port,
    };
  }

  return {
    canStart: false,
    port,
    errorMessage: `Configured port ${port} is already in use`,
  };
}
