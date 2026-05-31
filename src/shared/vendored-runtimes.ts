import type {
  VendoredRuntimeDefinition,
  VendoredRuntimeId,
} from '../types/dependency-management.js';

export const vendoredRuntimes: readonly VendoredRuntimeDefinition[] = [
] as const;

export function findVendoredRuntime(id: string): VendoredRuntimeDefinition | null {
  return vendoredRuntimes.find((definition) => definition.id === id) ?? null;
}

export function isVendoredRuntimeId(id: string): id is VendoredRuntimeId {
  return findVendoredRuntime(id) !== null;
}
