#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveBundledNodePolicy,
  resolveRuntimePolicyContext,
} from './runtime-node-policy.js';

test('resolveRuntimePolicyContext normalizes Store build selectors', () => {
  assert.deepEqual(
    resolveRuntimePolicyContext({
      env: {
        HAGICODE_RUNTIME_CONSUMER: ' Windows-Store ',
        HAGICODE_RUNTIME_DEPENDENCY_MANAGEMENT_MODE: ' External-Managed ',
      },
    }),
    {
      consumer: 'windows-store',
      dependencyManagementMode: 'external-managed',
    },
  );
});

test('resolveBundledNodePolicy keeps Node required by default', () => {
  const policy = resolveBundledNodePolicy({
    manifest: {
      components: [
        {
          name: 'node',
          optionalPolicy: {
            rules: [
              {
                id: 'external-managed',
                dependencyManagementModes: ['external-managed'],
              },
            ],
          },
        },
      ],
    },
    env: {},
  });

  assert.equal(policy.required, true);
  assert.equal(policy.skipped, false);
  assert.equal(policy.reason, null);
});

test('resolveBundledNodePolicy skips Node when external dependency management is active', () => {
  const policy = resolveBundledNodePolicy({
    manifest: {
      components: [
        {
          name: 'node',
          optionalPolicy: {
            rules: [
              {
                id: 'external-managed',
                dependencyManagementModes: ['external-managed'],
              },
            ],
          },
        },
      ],
    },
    env: {
      HAGICODE_RUNTIME_CONSUMER: 'windows-store',
      HAGICODE_RUNTIME_DEPENDENCY_MANAGEMENT_MODE: 'external-managed',
    },
  });

  assert.equal(policy.required, false);
  assert.equal(policy.skipped, true);
  assert.match(policy.reason, /external-managed/);
});
