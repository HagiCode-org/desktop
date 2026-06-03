#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGlobalHagiscriptPackageRoot } from '../global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.3.3';

function applyVendoredRuntimeEnvironmentOverrides() {
  const componentType = process.env.HAGISCRIPT_RUNTIME_COMPONENT_TYPE?.trim();
  const componentVersion = process.env.HAGISCRIPT_RUNTIME_COMPONENT_VERSION?.trim();
  const configuredVendoredTag = process.env.HAGISCRIPT_RUNTIME_VENDORED_TAG?.trim();

  if (componentType !== 'bundled-runtime' || !componentVersion || configuredVendoredTag) {
    return;
  }

  process.env.HAGISCRIPT_RUNTIME_VENDORED_TAG = componentVersion.startsWith('v')
    ? componentVersion
    : `v${componentVersion}`;
}

export async function runDelegatedRuntimeScript(scriptName) {
  applyVendoredRuntimeEnvironmentOverrides();
  const hagiscriptPackageRoot = resolveGlobalHagiscriptPackageRoot(MINIMUM_HAGISCRIPT_VERSION);
  const targetPath = path.join(hagiscriptPackageRoot, 'runtime', 'scripts', scriptName);
  await import(pathToFileURL(targetPath).href);
}
