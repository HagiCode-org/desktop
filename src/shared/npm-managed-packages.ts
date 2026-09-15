import { coerce, satisfies, valid, validRange } from 'semver';
import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementSnapshot,
  DependencyReadinessPackageSummary,
  DependencyReadinessSummary,
} from '../types/dependency-management.js';
import {
  runtimeManagedPackageManifestPackages,
  type RuntimeManagedPackageManifestEntry,
} from './generated/managed-package-manifest.js';

type ManagedNpmPackageStaticDefinition = Omit<ManagedNpmPackageDefinition, 'installSpec' | 'requiredVersionRange'> & {
  installSpec: string;
  installArgs?: string[];
  requiredVersionRange?: string;
};

function buildInstallSpecFromManifest(
  packageName: string,
  override: RuntimeManagedPackageManifestEntry,
): string {
  const target = override.target?.trim();
  if (!target) {
    return packageName;
  }

  if (target.startsWith('@') || /[@/:]/.test(target)) {
    return target;
  }

  return `${packageName}@${target}`;
}

function applyRuntimeManagedPackageOverride(
  definition: ManagedNpmPackageStaticDefinition,
): ManagedNpmPackageDefinition {
  const override = runtimeManagedPackageManifestPackages[definition.packageName];
  if (!override) {
    return definition;
  }

  return {
    ...definition,
    installSpec: buildInstallSpecFromManifest(definition.packageName, override),
    installArgs: override.installArgs,
    requiredVersionRange: override.version,
  };
}

const staticManagedNpmPackages = [
  {
    id: 'openspec',
    packageName: '@fission-ai/openspec',
    displayName: 'OpenSpec',
    descriptionKey: 'dependencyManagement.packages.openspec.description',
    binName: 'openspec',
    installSpec: '@fission-ai/openspec',
    category: 'workflow',
    required: true,
  },
  {
    id: 'skills',
    packageName: 'skills',
    displayName: 'Skills',
    descriptionKey: 'dependencyManagement.packages.skills.description',
    binName: 'skills',
    installSpec: 'skills',
    category: 'workflow',
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
    required: true,
  },
  {
    id: 'claude-code',
    packageName: '@anthropic-ai/claude-code',
    displayName: 'Claude Code',
    descriptionKey: 'dependencyManagement.packages.claudeCode.description',
    binName: 'claude',
    installSpec: '@anthropic-ai/claude-code',
    category: 'agent-cli',
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
    agentCliId: 'codex',
    docsLinkId: 'codexSetup',
  },
  {
    id: 'pi',
    packageName: '@earendil-works/pi-coding-agent',
    displayName: 'PI',
    descriptionKey: 'dependencyManagement.packages.pi.description',
    binName: 'pi',
    installSpec: '@earendil-works/pi-coding-agent@0.78.1',
    installArgs: ['--ignore-scripts'],
    requiredVersionRange: '0.78.1',
    category: 'agent-cli',
    agentCliId: 'pi',
  },
  {
    id: 'reasonix',
    packageName: 'reasonix',
    displayName: 'Reasonix',
    descriptionKey: 'dependencyManagement.packages.reasonix.description',
    binName: 'reasonix',
    installSpec: 'reasonix@1.2.0',
    requiredVersionRange: '1.2.0',
    category: 'agent-cli',
    agentCliId: 'reasonix',
  },
  {
    id: 'github-copilot',
    packageName: '@github/copilot',
    displayName: 'GitHub Copilot',
    descriptionKey: 'dependencyManagement.packages.githubCopilot.description',
    binName: 'copilot',
    installSpec: '@github/copilot',
    category: 'agent-cli',
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
    agentCliId: 'gemini',
    docsLinkId: 'geminiSetup',
  },
  {
    id: 'impeccable',
    packageName: 'impeccable',
    displayName: 'Impeccable',
    descriptionKey: 'dependencyManagement.packages.impeccable.description',
    binName: 'impeccable',
    installSpec: 'impeccable',
    category: 'developer-tool',
  },
  {
    id: 'oh-my-pi',
    packageName: '@oh-my-pi/pi-coding-agent',
    displayName: 'Oh My Pi',
    descriptionKey: 'dependencyManagement.packages.ohMyPi.description',
    binName: 'omp',
    installSpec: '@oh-my-pi/pi-coding-agent',
    category: 'agent-cli',
    agentCliId: 'pi',
    externalCli: {
      installers: {
        darwin: {
          command: 'sh',
          args: ['-c', 'curl -fsSL https://omp.sh/install | sh'],
          shell: false,
        },
        linux: {
          command: 'sh',
          args: ['-c', 'curl -fsSL https://omp.sh/install | sh'],
          shell: false,
        },
        win32: {
          command: 'powershell.exe',
          args: ['-NoProfile', '-NonInteractive', '-Command', 'irm https://omp.sh/install.ps1 | iex'],
          shell: false,
        },
      },
      versionProbe: ['--version'],
    },
  },
] as const satisfies readonly ManagedNpmPackageStaticDefinition[];

export const managedNpmPackages: readonly ManagedNpmPackageDefinition[] = staticManagedNpmPackages
  .map(applyRuntimeManagedPackageOverride);

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
  (definition) => Boolean(definition.agentCliId),
);

export const managedExternalCliPackages = managedNpmPackages.filter(
  (definition) => Boolean(definition.externalCli),
);

export function findManagedNpmPackage(id: string): ManagedNpmPackageDefinition | null {
  return managedNpmPackages.find((definition) => definition.id === id) ?? null;
}

export function isManagedNpmPackageId(id: string): id is ManagedNpmPackageId {
  return findManagedNpmPackage(id) !== null;
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

export function getManagedPackageInstallArgs(
  definition: ManagedNpmPackageDefinition,
  registryUrl?: string | null,
): string[] {
  return [
    'install',
    '-g',
    ...(definition.installArgs ?? []),
    ...(registryUrl ? ['--registry', registryUrl] : []),
    definition.installSpec,
  ];
}

export function buildManagedPackageGlobalInstallCommand(
  definition: ManagedNpmPackageDefinition,
  registryUrl?: string | null,
): string {
  return `npm ${getManagedPackageInstallArgs(definition, registryUrl).join(' ')}`;
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
  const versionSatisfied = effectiveDefinition.externalCli
    ? statusSnapshot?.status === 'installed' && Boolean(statusSnapshot.executablePath) && Boolean(installedVersion)
    : isManagedPackageVersionSatisfied(effectiveDefinition, installedVersion);

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
  selectedDeveloperToolPackageIds: readonly string[] = [],
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
  const selectedDeveloperToolIds = selectedDeveloperToolPackageIds.filter(
    (id): id is ManagedNpmPackageId => optionalPackages.some((item) => item.id === id && Boolean(item.definition.externalCli)),
  );
  const missingSelectedDeveloperToolPackageIds = selectedDeveloperToolIds.filter((id) => {
    const item = optionalPackages.find((candidate) => candidate.id === id);
    return item?.status !== 'installed' || !item.versionSatisfied;
  });
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
  const agentCliReady = selectedAgentCliPackageIds.length === 0
    || (selectedSupportedIds.length > 0 && satisfiedSelectedAgentCliPackageIds.length > 0);
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

  if (selectedAgentCliPackageIds.length > 0 && selectedSupportedIds.length === 0) {
    blockingReasons.push({
      code: 'agent-cli-not-selected',
      message: 'No selected Agent CLI is supported by Desktop.',
    });
  } else if (selectedSupportedIds.length > 0 && !agentCliReady) {
    blockingReasons.push({
      code: 'agent-cli-not-installed',
      message: 'At least one selected Agent CLI package must be installed at a supported version in the Desktop managed npm environment.',
      packageIds: unsatisfiedSelectedAgentCliPackageIds,
    });
  }
  if (missingSelectedDeveloperToolPackageIds.length > 0) {
    blockingReasons.push({
      code: 'external-cli-not-ready',
      message: 'Selected developer tools must be installed and pass executable validation.',
      packageIds: missingSelectedDeveloperToolPackageIds,
    });
  }

  return {
    environmentAvailable: snapshot.environment.available,
    requiredReady,
    agentCliReady,
    ready: snapshot.environment.available && requiredReady && agentCliReady && missingSelectedDeveloperToolPackageIds.length === 0,
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
    selectedDeveloperToolPackageIds: selectedDeveloperToolIds,
    missingSelectedDeveloperToolPackageIds,
    blockingReasons,
  };
}
