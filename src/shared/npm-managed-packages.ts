import type { ManagedNpmPackageDefinition, ManagedNpmPackageId } from '../types/npm-management.js';

export const managedNpmPackages: readonly ManagedNpmPackageDefinition[] = [
  {
    id: 'openspec',
    packageName: '@fission-ai/openspec',
    displayName: 'OpenSpec',
    descriptionKey: 'npmManagement.packages.openspec.description',
    binName: 'openspec',
    installSpec: '@fission-ai/openspec@1.3.1',
    required: true,
  },
  {
    id: 'skills',
    packageName: 'skills',
    displayName: 'Skills',
    descriptionKey: 'npmManagement.packages.skills.description',
    binName: 'skills',
    installSpec: 'skills@1.5.1',
    required: true,
  },
  {
    id: 'omniroute',
    packageName: 'omniroute',
    displayName: 'OmniRoute',
    descriptionKey: 'npmManagement.packages.omniroute.description',
    binName: 'omniroute',
    installSpec: 'omniroute@3.6.9',
    required: true,
  },
  {
    id: 'code-server',
    packageName: 'code-server',
    displayName: 'code-server',
    descriptionKey: 'npmManagement.packages.codeServer.description',
    binName: 'code-server',
    installSpec: 'code-server@latest',
    required: true,
  },
] as const;

export function findManagedNpmPackage(id: string): ManagedNpmPackageDefinition | null {
  return managedNpmPackages.find((definition) => definition.id === id) ?? null;
}

export function isManagedNpmPackageId(id: string): id is ManagedNpmPackageId {
  return findManagedNpmPackage(id) !== null;
}
