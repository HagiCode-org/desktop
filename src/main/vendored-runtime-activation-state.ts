import type {
  VendoredRuntimeActivationProgress,
  VendoredRuntimeId,
} from '../types/dependency-management.js';

type VendoredRuntimeActivationListener = (
  event: VendoredRuntimeActivationProgress,
) => void;

const activationByRuntime = new Map<
  VendoredRuntimeId,
  VendoredRuntimeActivationProgress
>();
const listeners = new Set<VendoredRuntimeActivationListener>();

function emit(event: VendoredRuntimeActivationProgress): void {
  activationByRuntime.set(event.runtimeId, event);
  for (const listener of listeners) {
    listener(event);
  }
}

export function setVendoredRuntimeActivationProgress(
  event: VendoredRuntimeActivationProgress,
): void {
  emit(event);
}

export function clearVendoredRuntimeActivationProgress(
  runtimeId: VendoredRuntimeId,
): void {
  activationByRuntime.delete(runtimeId);
}

export function getVendoredRuntimeActivationProgress(
  runtimeId: VendoredRuntimeId,
): VendoredRuntimeActivationProgress | null {
  return activationByRuntime.get(runtimeId) ?? null;
}

export function getActiveVendoredRuntimeActivation(): VendoredRuntimeActivationProgress | null {
  const active = [...activationByRuntime.values()].find(
    (item) => !['completed', 'failed'].includes(item.stage),
  );
  return active ?? null;
}

export function onVendoredRuntimeActivationProgress(
  listener: VendoredRuntimeActivationListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
