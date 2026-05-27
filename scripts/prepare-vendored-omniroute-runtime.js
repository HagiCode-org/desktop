#!/usr/bin/env node

import path from 'node:path';
import {
  updateDesktopRuntimeComponents,
  isManagedDesktopRuntimeComponentExecution,
  resolveManagedDesktopRuntimeComponentRoot,
} from './desktop-runtime-hagiscript.js';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
  validateOmniRouteRuntimePayload,
} from './omniroute-runtime-contract.js';
import { resolveStagedDesktopRuntimeComponentRoot } from './desktop-runtime-layout.js';
import { assertGlobalHagiscriptAvailable } from './global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.2.8';

main().catch((error) => {
  console.error('[omniroute-runtime] Failed to prepare vendored runtime:', error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const hagiscriptVersion = assertGlobalHagiscriptAvailable(MINIMUM_HAGISCRIPT_VERSION);

  if (!isManagedDesktopRuntimeComponentExecution(['omniroute'])) {
    await updateDesktopRuntimeComponents(['omniroute'], {
      force: process.env.HAGICODE_FORCE_OMNIROUTE_RUNTIME_RESTAGE === '1',
    });
  }

  const config = readOmniRouteRuntimeConfig();
  const platformKey = process.env.HAGICODE_OMNIROUTE_PLATFORM || detectOmniRouteRuntimePlatform();
  const runtimeRoot = resolveManagedDesktopRuntimeComponentRoot()
    || resolveStagedDesktopRuntimeComponentRoot('omniroute', { cwd: process.cwd() });
  const validation = validateOmniRouteRuntimePayload(runtimeRoot, { platformKey, config });
  const errors = [...validation.missingEntries, ...validation.diagnostics];

  if (errors.length > 0) {
    throw new Error(`Prepared vendored OmniRoute packaged payload is invalid:\n- ${errors.join('\n- ')}`);
  }

  console.log(`[omniroute-runtime] Prepared vendored OmniRoute archive payload for ${platformKey}`);
  console.log(`[omniroute-runtime] Staged packaged runtime root: ${runtimeRoot}`);
  console.log(`[omniroute-runtime] Marker: ${validation.metadataPath ?? path.join(runtimeRoot, '.hagicode-runtime.json')}`);
  console.log(`[omniroute-runtime] Archive: ${validation.archivePath ?? path.join(runtimeRoot, 'archives', 'omniroute.7z')}`);
  console.log(`[omniroute-runtime] Completed hagiscript-managed staging with hagiscript ${hagiscriptVersion}`);
}
