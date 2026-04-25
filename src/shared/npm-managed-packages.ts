import type { ManagedNpmPackageDefinition, ManagedNpmPackageId } from '../types/npm-management.js';

export const managedNpmPackages: readonly ManagedNpmPackageDefinition[] = [
  {
    id: 'openspec',
    packageName: 'openspec',
    displayName: 'OpenSpec',
    descriptionKey: 'npmManagement.packages.openspec.description',
    binName: 'openspec',
    installSpec: 'openspec@latest',
  },
  {
    id: 'skills',
    packageName: 'skills',
    displayName: 'Skills',
    descriptionKey: 'npmManagement.packages.skills.description',
    binName: 'skills',
    installSpec: 'skills@latest',
  },
  {
    id: 'omniroute',
    packageName: 'omniroute',
    displayName: 'OmniRoute',
    descriptionKey: 'npmManagement.packages.omniroute.description',
    binName: 'omniroute',
    installSpec: 'omniroute@latest',
  },
] as const;

export function findManagedNpmPackage(id: string): ManagedNpmPackageDefinition | null {
  return managedNpmPackages.find((definition) => definition.id === id) ?? null;
}

export function isManagedNpmPackageId(id: string): id is ManagedNpmPackageId {
  return findManagedNpmPackage(id) !== null;
}

