import { coerce, satisfies, valid, validRange } from 'semver';
import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementSnapshot,
  DependencyReadinessPackageSummary,
  DependencyReadinessSummary,
} from '../types/dependency-management.js';
import { isVendoredRuntimeId } from './vendored-runtimes.js';

export const managedNpmPackages: readonly ManagedNpmPackageDefinition[] = [
  {
    id: 'hagiscript',
    packageName: '@hagicode/hagiscript',
    displayName: 'hagiscript',
    descriptionKey: 'dependencyManagement.packages.hagiscript.description',
    binName: 'hagiscript',
    installSpec: '@hagicode/hagiscript@0.2.10',
    requiredVersionRange: '>=0.2.10',
    category: 'bootstrap',
    installMode: 'embedded-npm',
    required: true,
  },
  {
    id: 'openspec',
    packageName: '@fission-ai/openspec',
    displayName: 'OpenSpec',
    descriptionKey: 'dependencyManagement.packages.openspec.description',
    binName: 'openspec',
    installSpec: '@fission-ai/openspec@1.3.1',
    requiredVersionRange: '>=1.3.1',
    category: 'workflow',
    installMode: 'hagiscript-sync',
    required: true,
  },
  {
    id: 'skills',
    packageName: 'skills',
    displayName: 'Skills',
    descriptionKey: 'dependencyManagement.packages.skills.description',
    binName: 'skills',
    installSpec: 'skills@1.5.1',
    requiredVersionRange: '>=1.5.1',
    category: 'workflow',
    installMode: 'hagiscript-sync',
    required: true,
  },
  {
    id: 'pm2',
    packageName: 'pm2',
    displayName: 'PM2',
    descriptionKey: 'dependencyManagement.packages.pm2.description',
    binName: 'pm2',
    installSpec: 'pm2@7.0.1',
    requiredVersionRange: '>=7.0.1',
    category: 'workflow',
    installMode: 'hagiscript-sync',
  },
  {
    id: 'claude-code',
    packageName: '@anthropic-ai/claude-code',
    displayName: 'Claude Code',
    descriptionKey: 'dependencyManagement.packages.claudeCode.description',
    binName: 'claude',
    installSpec: '@anthropic-ai/claude-code',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'claude-code',
    docsLinkId: 'claudeCodeSetup',
  },
  {
    id: 'codex',
    packageName: '@openai/codex',
    displayName: 'Codex',
    descriptionKey: 'dependencyManagement.packages.codex.description',
    binName: 'codex',
    installSpec: '@openai/codex',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'codex',
    docsLinkId: 'codexSetup',
  },
  {
    id: 'github-copilot',
    packageName: '@github/copilot',
    displayName: 'GitHub Copilot',
    descriptionKey: 'dependencyManagement.packages.githubCopilot.description',
    binName: 'copilot',
    installSpec: '@github/copilot',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'copilot',
    docsLinkId: 'copilotSetup',
  },
  {
    id: 'codebuddy',
    packageName: '@tencent-ai/codebuddy-code',
    displayName: 'CodeBuddy',
    descriptionKey: 'dependencyManagement.packages.codebuddy.description',
    binName: 'codebuddy',
    installSpec: '@tencent-ai/codebuddy-code',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'codebuddy',
  },
  {
    id: 'opencode',
    packageName: 'opencode-ai',
    displayName: 'OpenCode',
    descriptionKey: 'dependencyManagement.packages.opencode.description',
    binName: 'opencode',
    installSpec: 'opencode-ai',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'opencode',
    docsLinkId: 'opencodeSetup',
  },
  {
    id: 'qoder',
    packageName: '@qoder-ai/qodercli',
    displayName: 'QoderCLI',
    descriptionKey: 'dependencyManagement.packages.qoder.description',
    binName: 'qodercli',
    installSpec: '@qoder-ai/qodercli',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'qoder',
    docsLinkId: 'qoderSetup',
  },
  {
    id: 'gemini',
    packageName: '@google/gemini-cli',
    displayName: 'Gemini',
    descriptionKey: 'dependencyManagement.packages.gemini.description',
    binName: 'gemini',
    installSpec: '@google/gemini-cli',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'gemini',
    docsLinkId: 'geminiSetup',
  },
  {
    id: 'impeccable',
    packageName: 'impeccable',
    displayName: 'Impeccable',
    descriptionKey: 'dependencyManagement.packages.impeccable.description',
    binName: 'impeccable',
    installSpec: 'impeccable@2.1.9',
    requiredVersionRange: '>=2.1.9',
    category: 'developer-tool',
    installMode: 'hagiscript-sync',
  },
] as const;

export const managedAgentCliPackages = managedNpmPackages.filter(
  (definition) => definition.category === 'agent-cli',
);

export const requiredManagedNpmPackages = managedNpmPackages.filter(
  (definition) => definition.required === true,
);

export const optionalManagedNpmPackages = managedNpmPackages.filter(
  (definition) => definition.required !== true && definition.category !== 'agent-cli',
);

export const npmInstallableAgentCliPackages = managedAgentCliPackages.filter(
  (definition) => definition.installMode === 'hagiscript-sync' && Boolean(definition.agentCliId),
);

export function findManagedNpmPackage(id: string): ManagedNpmPackageDefinition | null {
  return managedNpmPackages.find((definition) => definition.id === id) ?? null;
}

export function isManagedNpmPackageId(id: string): id is ManagedNpmPackageId {
  return findManagedNpmPackage(id) !== null;
}

export function isVendoredRuntimeMutationId(id: string): boolean {
  return isVendoredRuntimeId(id);
}

export function findManagedPackageStatus(
  snapshot: DependencyManagementSnapshot,
  packageId: ManagedNpmPackageId,
): ManagedNpmPackageStatusSnapshot | null {
  return snapshot.packages.find((item) => item.id === packageId) ?? null;
}

export function isNpmInstallableAgentCliPackageId(id: string): id is ManagedNpmPackageId {
  return npmInstallableAgentCliPackages.some((definition) => definition.id === id);
}

export function getSupportedSelectedAgentCliPackageIds(selectedIds: readonly string[]): ManagedNpmPackageId[] {
  const seen = new Set<ManagedNpmPackageId>();
  const supportedIds: ManagedNpmPackageId[] = [];

  for (const id of selectedIds) {
    if (!isNpmInstallableAgentCliPackageId(id) || seen.has(id)) {
      continue;
    }

    seen.add(id);
    supportedIds.push(id);
  }

  return supportedIds;
}

export function getManagedPackageRequiredVersionRange(
  definition: ManagedNpmPackageDefinition,
): string | null {
  if (definition.requiredVersionRange) {
    return validRange(definition.requiredVersionRange, { includePrerelease: true }) ?? null;
  }

  const installSpec = definition.installSpec.trim();
  const scopedTargetPrefix = `${definition.packageName}@`;

  if (installSpec === definition.packageName || !installSpec.startsWith(scopedTargetPrefix)) {
    return null;
  }

  const selector = installSpec.slice(scopedTargetPrefix.length).trim();
  if (!selector) {
    return null;
  }

  return validRange(selector, { includePrerelease: true }) ?? null;
}

export function isManagedPackageVersionSatisfied(
  definition: ManagedNpmPackageDefinition,
  installedVersion: string | null | undefined,
): boolean {
  const requiredVersionRange = getManagedPackageRequiredVersionRange(definition);
  if (!requiredVersionRange) {
    return true;
  }

  if (!installedVersion) {
    return false;
  }

  // Prefer the raw version when it is a valid semver string (preserves prerelease identifiers).
  // Fall back to coerce only for non-standard version strings that need normalisation.
  const normalizedVersion = valid(installedVersion) ?? coerce(installedVersion)?.version;
  if (!normalizedVersion) {
    return false;
  }

  return satisfies(normalizedVersion, requiredVersionRange, { includePrerelease: true });
}

function toReadinessPackageSummary(
  definition: ManagedNpmPackageDefinition,
  snapshot: DependencyManagementSnapshot,
): DependencyReadinessPackageSummary {
  const statusSnapshot = findManagedPackageStatus(snapshot, definition.id);
  const effectiveDefinition = statusSnapshot?.definition ?? definition;
  const installedVersion = statusSnapshot?.version ?? null;
  const requiredVersionRange = getManagedPackageRequiredVersionRange(effectiveDefinition);
  const versionSatisfied = isManagedPackageVersionSatisfied(effectiveDefinition, installedVersion);

  return {
    id: definition.id,
    definition: effectiveDefinition,
    status: statusSnapshot?.status ?? 'unknown',
    installedVersion,
    installSpec: effectiveDefinition.installSpec,
    requiredVersionRange,
    versionSatisfied,
    packageName: effectiveDefinition.packageName,
    message: statusSnapshot?.message,
  };
}

export function evaluateDependencyReadiness(
  snapshot: DependencyManagementSnapshot,
  selectedAgentCliPackageIds: readonly string[],
): DependencyReadinessSummary {
  const requiredPackages = requiredManagedNpmPackages.map((definition) =>
    toReadinessPackageSummary(definition, snapshot),
  );
  const optionalPackages = optionalManagedNpmPackages.map((definition) =>
    toReadinessPackageSummary(definition, snapshot),
  );
  const agentCliPackages = npmInstallableAgentCliPackages.map((definition) =>
    toReadinessPackageSummary(definition, snapshot),
  );
  const selectedSupportedIds = getSupportedSelectedAgentCliPackageIds(selectedAgentCliPackageIds);
  const selectedSupportedSet = new Set(selectedSupportedIds);
  const agentCliPackageById = new Map(agentCliPackages.map((item) => [item.id, item]));
  const installedSelectedAgentCliPackageIds = selectedSupportedIds.filter(
    (id) => agentCliPackageById.get(id)?.status === 'installed',
  );
  const satisfiedSelectedAgentCliPackageIds = selectedSupportedIds.filter((id) => {
    const item = agentCliPackageById.get(id);
    return item?.status === 'installed' && item.versionSatisfied;
  });
  const missingRequiredPackageIds = requiredPackages
    .filter((item) => item.status !== 'installed')
    .map((item) => item.id);
  const versionMismatchRequiredPackageIds = requiredPackages
    .filter((item) => item.status === 'installed' && !item.versionSatisfied)
    .map((item) => item.id);
  const unsatisfiedRequiredPackageIds = Array.from(new Set([
    ...missingRequiredPackageIds,
    ...versionMismatchRequiredPackageIds,
  ]));
  const missingSelectedAgentCliPackageIds = agentCliPackages
    .filter((item) => selectedSupportedSet.has(item.id) && item.status !== 'installed')
    .map((item) => item.id);
  const versionMismatchSelectedAgentCliPackageIds = agentCliPackages
    .filter((item) => selectedSupportedSet.has(item.id) && item.status === 'installed' && !item.versionSatisfied)
    .map((item) => item.id);
  const unsatisfiedSelectedAgentCliPackageIds = Array.from(new Set([
    ...missingSelectedAgentCliPackageIds,
    ...versionMismatchSelectedAgentCliPackageIds,
  ]));
  const ignoredSelectedAgentCliPackageIds = selectedAgentCliPackageIds.filter(
    (id) => !isNpmInstallableAgentCliPackageId(id),
  );
  const requiredReady = unsatisfiedRequiredPackageIds.length === 0;
  const agentCliReady = selectedSupportedIds.length > 0 && satisfiedSelectedAgentCliPackageIds.length > 0;
  const blockingReasons: DependencyReadinessSummary['blockingReasons'] = [];

  if (!snapshot.environment.available) {
    blockingReasons.push({
      code: 'environment-unavailable',
      message: snapshot.environment.error ?? 'Desktop managed Node/npm environment is unavailable.',
    });
  }

  if (!requiredReady) {
    blockingReasons.push({
      code: 'required-packages-missing',
      message: 'Required managed npm packages are missing, outdated, or unknown.',
      packageIds: unsatisfiedRequiredPackageIds,
    });
  }

  if (selectedSupportedIds.length === 0) {
    blockingReasons.push({
      code: 'agent-cli-not-selected',
      message: 'Select at least one supported Agent CLI package managed by HagiCode Desktop.',
    });
  } else if (!agentCliReady) {
    blockingReasons.push({
      code: 'agent-cli-not-installed',
      message: 'At least one selected Agent CLI package must be installed at a supported version in the Desktop managed npm environment.',
      packageIds: unsatisfiedSelectedAgentCliPackageIds,
    });
  }

  return {
    environmentAvailable: snapshot.environment.available,
    requiredReady,
    agentCliReady,
    ready: snapshot.environment.available && requiredReady && agentCliReady,
    requiredPackages,
    optionalPackages,
    agentCliPackages,
    missingRequiredPackageIds,
    versionMismatchRequiredPackageIds,
    missingSelectedAgentCliPackageIds,
    versionMismatchSelectedAgentCliPackageIds,
    selectedAgentCliPackageIds: selectedSupportedIds,
    installedSelectedAgentCliPackageIds,
    ignoredSelectedAgentCliPackageIds,
    blockingReasons,
  };
}
