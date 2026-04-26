import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  NpmManagementSnapshot,
  NpmReadinessPackageSummary,
  NpmReadinessSummary,
} from '../types/npm-management.js';

export const managedNpmPackages: readonly ManagedNpmPackageDefinition[] = [
  {
    id: 'hagiscript',
    packageName: '@hagicode/hagiscript',
    displayName: 'hagiscript',
    descriptionKey: 'npmManagement.packages.hagiscript.description',
    binName: 'hagiscript',
    installSpec: '@hagicode/hagiscript',
    category: 'bootstrap',
    installMode: 'embedded-npm',
    required: true,
  },
  {
    id: 'openspec',
    packageName: '@fission-ai/openspec',
    displayName: 'OpenSpec',
    descriptionKey: 'npmManagement.packages.openspec.description',
    binName: 'openspec',
    installSpec: '@fission-ai/openspec@1.3.1',
    category: 'workflow',
    installMode: 'hagiscript-sync',
    required: true,
  },
  {
    id: 'skills',
    packageName: 'skills',
    displayName: 'Skills',
    descriptionKey: 'npmManagement.packages.skills.description',
    binName: 'skills',
    installSpec: 'skills@1.5.1',
    category: 'workflow',
    installMode: 'hagiscript-sync',
    required: true,
  },
  {
    id: 'pm2',
    packageName: 'pm2',
    displayName: 'PM2',
    descriptionKey: 'npmManagement.packages.pm2.description',
    binName: 'pm2',
    installSpec: 'pm2',
    category: 'workflow',
    installMode: 'hagiscript-sync',
    required: true,
  },
  {
    id: 'omniroute',
    packageName: 'omniroute',
    displayName: 'OmniRoute',
    descriptionKey: 'npmManagement.packages.omniroute.description',
    binName: 'omniroute',
    installSpec: 'omniroute@3.6.9',
    category: 'developer-tool',
    installMode: 'hagiscript-sync',
    required: true,
  },
  {
    id: 'claude-code',
    packageName: '@anthropic-ai/claude-code',
    displayName: 'Claude Code',
    descriptionKey: 'npmManagement.packages.claudeCode.description',
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
    descriptionKey: 'npmManagement.packages.codex.description',
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
    descriptionKey: 'npmManagement.packages.githubCopilot.description',
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
    descriptionKey: 'npmManagement.packages.codebuddy.description',
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
    descriptionKey: 'npmManagement.packages.opencode.description',
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
    descriptionKey: 'npmManagement.packages.qoder.description',
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
    descriptionKey: 'npmManagement.packages.gemini.description',
    binName: 'gemini',
    installSpec: '@google/gemini-cli',
    category: 'agent-cli',
    installMode: 'hagiscript-sync',
    agentCliId: 'gemini',
    docsLinkId: 'geminiSetup',
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

export function findManagedPackageStatus(
  snapshot: NpmManagementSnapshot,
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

function toReadinessPackageSummary(
  definition: ManagedNpmPackageDefinition,
  snapshot: NpmManagementSnapshot,
): NpmReadinessPackageSummary {
  const statusSnapshot = findManagedPackageStatus(snapshot, definition.id);

  return {
    id: definition.id,
    definition,
    status: statusSnapshot?.status ?? 'unknown',
    installedVersion: statusSnapshot?.version ?? null,
    installSpec: definition.installSpec,
    packageName: definition.packageName,
    message: statusSnapshot?.message,
  };
}

export function evaluateNpmReadiness(
  snapshot: NpmManagementSnapshot,
  selectedAgentCliPackageIds: readonly string[],
): NpmReadinessSummary {
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
  const missingRequiredPackageIds = requiredPackages
    .filter((item) => item.status !== 'installed')
    .map((item) => item.id);
  const missingSelectedAgentCliPackageIds = agentCliPackages
    .filter((item) => selectedSupportedSet.has(item.id) && item.status !== 'installed')
    .map((item) => item.id);
  const ignoredSelectedAgentCliPackageIds = selectedAgentCliPackageIds.filter(
    (id) => !isNpmInstallableAgentCliPackageId(id),
  );
  const requiredReady = missingRequiredPackageIds.length === 0;
  const agentCliReady = selectedSupportedIds.length > 0 && installedSelectedAgentCliPackageIds.length > 0;
  const blockingReasons: NpmReadinessSummary['blockingReasons'] = [];

  if (!snapshot.environment.available) {
    blockingReasons.push({
      code: 'environment-unavailable',
      message: snapshot.environment.error ?? 'Desktop managed Node/npm environment is unavailable.',
    });
  }

  if (!requiredReady) {
    blockingReasons.push({
      code: 'required-packages-missing',
      message: 'Required managed npm packages are missing or unknown.',
      packageIds: missingRequiredPackageIds,
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
      message: 'At least one selected Agent CLI package must be installed in the Desktop managed npm environment.',
      packageIds: missingSelectedAgentCliPackageIds,
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
    missingSelectedAgentCliPackageIds,
    selectedAgentCliPackageIds: selectedSupportedIds,
    installedSelectedAgentCliPackageIds,
    ignoredSelectedAgentCliPackageIds,
    blockingReasons,
  };
}
