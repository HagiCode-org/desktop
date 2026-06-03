import { readRuntimeManifestStore } from './runtime-manifest-store.js';

export const RUNTIME_CONSUMER_ENV = 'HAGICODE_RUNTIME_CONSUMER';
export const RUNTIME_DEPENDENCY_MANAGEMENT_MODE_ENV = 'HAGICODE_RUNTIME_DEPENDENCY_MANAGEMENT_MODE';

export function resolveRuntimePolicyContext(options = {}) {
  return {
    consumer: normalizePolicySelector(
      options.consumer ?? options.env?.[RUNTIME_CONSUMER_ENV] ?? process.env[RUNTIME_CONSUMER_ENV]
    ),
    dependencyManagementMode: normalizePolicySelector(
      options.dependencyManagementMode
        ?? options.env?.[RUNTIME_DEPENDENCY_MANAGEMENT_MODE_ENV]
        ?? process.env[RUNTIME_DEPENDENCY_MANAGEMENT_MODE_ENV]
    ),
  };
}

export function resolveBundledNodePolicy(options = {}) {
  const manifest = options.manifest ?? readRuntimeManifestStore({
    manifestPath: options.manifestPath,
    userDataPath: options.userDataPath,
    cwd: options.cwd,
    env: options.env,
  });
  const component = findManifestComponent(manifest, 'node');
  const context = resolveRuntimePolicyContext(options);
  const match = findMatchingOptionalPolicyRule(component?.optionalPolicy, context);

  return {
    required: match === null,
    skipped: match !== null,
    componentName: 'node',
    context,
    reason: match ? describePolicyMatch(match, context) : null,
    rule: match,
  };
}

function findManifestComponent(manifest, componentName) {
  if (!Array.isArray(manifest?.components)) {
    return null;
  }

  return manifest.components.find((component) => component?.name === componentName) ?? null;
}

function findMatchingOptionalPolicyRule(optionalPolicy, context) {
  const rules = Array.isArray(optionalPolicy?.rules) ? optionalPolicy.rules : [];
  return rules.find((rule) => runtimeOptionalPolicyRuleMatches(rule, context)) ?? null;
}

function runtimeOptionalPolicyRuleMatches(rule, context) {
  if (Array.isArray(rule?.consumers) && rule.consumers.length > 0) {
    if (!context.consumer) {
      return false;
    }

    const consumers = rule.consumers.map(normalizePolicySelector).filter(Boolean);
    if (!consumers.includes(context.consumer)) {
      return false;
    }
  }

  if (Array.isArray(rule?.dependencyManagementModes) && rule.dependencyManagementModes.length > 0) {
    if (!context.dependencyManagementMode) {
      return false;
    }

    const modes = rule.dependencyManagementModes.map(normalizePolicySelector).filter(Boolean);
    if (!modes.includes(context.dependencyManagementMode)) {
      return false;
    }
  }

  return true;
}

function describePolicyMatch(rule, context) {
  const selectors = [
    ...(context.consumer ? [`consumer=${context.consumer}`] : []),
    ...(context.dependencyManagementMode
      ? [`dependencyManagementMode=${context.dependencyManagementMode}`]
      : []),
  ];
  const ruleId = typeof rule?.id === 'string' && rule.id.trim() ? ` (${rule.id.trim()})` : '';

  return `optional policy matched${ruleId}${selectors.length > 0 ? `: ${selectors.join(', ')}` : ''}`;
}

function normalizePolicySelector(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || undefined;
}
