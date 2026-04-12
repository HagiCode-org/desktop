import type {
  SystemDiagnosticBridge,
  SystemDiagnosticChannelMap,
  SystemDiagnosticResult,
} from '../types/system-diagnostic.js';

export interface SystemDiagnosticInvoker {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

export function createSystemDiagnosticBridge(
  ipcRendererLike: SystemDiagnosticInvoker,
  channels: SystemDiagnosticChannelMap,
): SystemDiagnosticBridge {
  return {
    async run() {
      return ipcRendererLike.invoke(channels.run) as Promise<SystemDiagnosticResult>;
    },
    async getLast() {
      return ipcRendererLike.invoke(channels.getLast) as Promise<SystemDiagnosticResult | null>;
    },
  };
}
