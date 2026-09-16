import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBatchInstallCommand } from './dependencyManagementPageModel.js';
import type { ManagedNpmPackageDefinition } from '../../../types/dependency-management.js';

const definitions: ManagedNpmPackageDefinition[] = [
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
    id: 'pi',
    packageName: '@earendil-works/pi-coding-agent',
    displayName: 'PI',
    descriptionKey: 'dependencyManagement.packages.pi.description',
    binName: 'pi',
    installSpec: '@earendil-works/pi-coding-agent@0.78.1',
    installArgs: ['--ignore-scripts'],
    category: 'agent-cli',
    agentCliId: 'pi',
  },
];

describe('buildBatchInstallCommand', () => {
  it('creates one registry-aware install command per definition', () => {
    assert.equal(
      buildBatchInstallCommand(definitions, 'https://registry.example.test/'),
      [
        'npm install -g --registry https://registry.example.test/ @fission-ai/openspec',
        'npm install -g --ignore-scripts --registry https://registry.example.test/ @earendil-works/pi-coding-agent@0.78.1',
      ].join(' && \\\n'),
    );
  });

  it('uses Windows command continuation syntax', () => {
    assert.match(buildBatchInstallCommand(definitions, null, 'win32'), /openspec\s+&& \^\n/);
  });
});
