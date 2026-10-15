import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'agent-cli-probe-integration.yml');
const EXPECTED_PROBE_STEP_IDS = ['deps', 'control', 'install', 'oracle', 'refresh', 'probe', 'classify'];
const CONTINUE_ON_ERROR_IDS = ['control', 'install', 'oracle', 'probe'];
const REQUIRED_PATH_FILTERS = [
  'src/main/system-diagnostic-manager.ts',
  'src/main/managed-cli-executable-resolver.ts',
  'src/shared/agent-cli-catalog.ts',
  'src/shared/npm-managed-packages.ts',
  'src/types/agent-cli-catalog.ts',
  'scripts/agent-cli-probe/**',
  'scripts/generate-managed-npm-packages.js',
  '.github/workflows/agent-cli-probe-integration.yml',
];

/** Returns structural problems in a workflow document. An empty array means the structure holds. */
export function checkWorkflow(text) {
  const problems = [];
  let workflow;
  try {
    workflow = yaml.load(text);
  } catch (error) {
    return [`workflow does not parse: ${error.message}`];
  }

  const triggers = workflow.on ?? workflow[true];
  if (!triggers) return ['no triggers'];
  const prPaths = triggers.pull_request?.paths ?? [];
  const pushPaths = triggers.push?.paths ?? [];
  for (const filter of REQUIRED_PATH_FILTERS) {
    if (!prPaths.includes(filter)) problems.push(`pull_request path filter missing: ${filter}`);
    if (!pushPaths.includes(filter)) problems.push(`push path filter missing: ${filter}`);
  }
  if (!triggers.push?.branches?.includes('main')) problems.push('push trigger must target main');
  if (!Array.isArray(triggers.schedule) || triggers.schedule.length === 0) problems.push('weekly schedule missing');
  const inputs = triggers.workflow_dispatch?.inputs ?? {};
  for (const input of ['tier', 'os', 'cli', 'strict']) {
    if (!(input in inputs)) problems.push(`workflow_dispatch input missing: ${input}`);
  }

  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: 'read' })) {
    problems.push('permissions must be exactly contents: read');
  }
  if (workflow.concurrency?.['cancel-in-progress'] === undefined) problems.push('concurrency with PR cancellation missing');

  const probe = workflow.jobs?.probe;
  if (!probe) return [...problems, 'probe job missing'];
  if (probe['timeout-minutes'] !== 20) problems.push('probe job timeout must be 20 minutes');
  if (probe.strategy?.['fail-fast'] !== false) problems.push('probe job must set fail-fast: false');

  const stepIds = probe.steps.map((step) => step.id).filter(Boolean);
  const expectedOrder = EXPECTED_PROBE_STEP_IDS.filter((id) => stepIds.includes(id));
  if (JSON.stringify(stepIds.filter((id) => EXPECTED_PROBE_STEP_IDS.includes(id))) !== JSON.stringify(expectedOrder)) {
    problems.push('probe step ids are out of order');
  }
  for (const id of EXPECTED_PROBE_STEP_IDS) {
    if (!stepIds.includes(id)) problems.push(`probe step id missing: ${id}`);
  }
  for (const step of probe.steps) {
    if (CONTINUE_ON_ERROR_IDS.includes(step.id) && step.with === undefined && step['continue-on-error'] !== true) {
      problems.push(`step ${step.id} must set continue-on-error: true`);
    }
    if (['install', 'oracle', 'control', 'probe'].includes(step.id) && JSON.stringify(step).includes('secrets.')) {
      problems.push(`step ${step.id} references secrets`);
    }
  }

  const reportJob = workflow.jobs?.report;
  if (!reportJob || reportJob.needs?.includes?.('probe') !== true || !String(reportJob.if ?? '').includes('always()')) {
    problems.push('report job must need probe and run with always()');
  }
  const uploadStep = probe.steps.find((step) => String(step.uses ?? '').startsWith('actions/upload-artifact'));
  if (!uploadStep || !String(uploadStep.if ?? '').includes('always()')) problems.push('artifact upload must run with always()');

  return problems;
}

function nodeMajorOf(text) {
  return String(yaml.load(text).env?.NODE_VERSION ?? '');
}

describe('agent CLI probe workflow structure', () => {
  const text = readFileSync(workflowPath, 'utf8');

  it('the shipped workflow satisfies the structure contract', () => {
    assert.deepEqual(checkWorkflow(text), []);
  });

  it('uses the same Node major version as the other Desktop workflows', () => {
    const prChecks = readFileSync(path.join(repoRoot, '.github', 'workflows', 'pr-checks.yml'), 'utf8');
    assert.equal(nodeMajorOf(text), nodeMajorOf(prChecks));
  });

  it('fails when a step id is removed from a copy of the workflow', () => {
    const mutated = text.replace(/\n {8}id: install\n/, '\n');
    assert.notEqual(mutated, text, 'mutation must change the file');
    const problems = checkWorkflow(mutated);
    assert.ok(problems.some((item) => item.includes('install')), problems.join('\n'));
  });

  it('fails when a phase step loses continue-on-error', () => {
    const mutated = text.replace(/(\n {8}id: oracle\n {8}continue-on-error: true)/, '\n        id: oracle');
    assert.notEqual(mutated, text);
    assert.ok(checkWorkflow(mutated).some((item) => item.includes('oracle')));
  });

  it('fails when an install step can reach a secret', () => {
    const mutated = text.replace('GITHUB_ACTIONS: "true"', 'GITHUB_ACTIONS: "true"\n          TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    assert.ok(checkWorkflow(mutated).some((item) => item.includes('references secrets')));
  });

  it('fails when the workflow requests write permissions', () => {
    const mutated = text.replace('permissions:\n  contents: read', 'permissions:\n  contents: write');
    assert.ok(checkWorkflow(mutated).some((item) => item.includes('permissions')));
  });
});
