#!/usr/bin/env node

import path from 'node:path';
import {
  updateDesktopRuntimeComponents,
  isManagedDesktopRuntimeComponentExecution,
  resolveManagedDesktopRuntimeComponentRoot,
} from './desktop-runtime-hagiscript.js';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
  validateCodeServerRuntimePayload,
} from './code-server-runtime-contract.js';
import { resolveStagedDesktopRuntimeComponentRoot } from './desktop-runtime-layout.js';
import { assertGlobalHagiscriptAvailable } from './global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.2.10';

main().catch((error) => {
  console.error('[code-server-runtime] Failed to prepare vendored runtime:', error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const hagiscriptVersion = assertGlobalHagiscriptAvailable(MINIMUM_HAGISCRIPT_VERSION);

  if (!isManagedDesktopRuntimeComponentExecution(['code-server'])) {
    await updateDesktopRuntimeComponents(['code-server'], {
      force: process.env.HAGICODE_FORCE_CODE_SERVER_RUNTIME_RESTAGE === '1',
    });
  }

  const config = readCodeServerRuntimeConfig();
  const platformKey = process.env.HAGICODE_CODE_SERVER_PLATFORM || detectCodeServerRuntimePlatform();
  const runtimeRoot = resolveManagedDesktopRuntimeComponentRoot()
    || resolveStagedDesktopRuntimeComponentRoot('code-server', { cwd: process.cwd() });
  const validation = validateCodeServerRuntimePayload(runtimeRoot, { platformKey, config });
  const errors = [...validation.missingEntries, ...validation.diagnostics];

  if (errors.length > 0) {
    throw new Error(`Prepared vendored code-server packaged payload is invalid:\n- ${errors.join('\n- ')}`);
  }

  console.log(`[code-server-runtime] Prepared vendored code-server archive payload for ${platformKey}`);
  console.log(`[code-server-runtime] Staged packaged runtime root: ${runtimeRoot}`);
  console.log(`[code-server-runtime] Marker: ${validation.metadataPath ?? path.join(runtimeRoot, '.hagicode-runtime.json')}`);
  console.log(`[code-server-runtime] Archive: ${validation.archivePath ?? path.join(runtimeRoot, 'archives', 'code-server.7z')}`);
  console.log(`[code-server-runtime] Completed hagiscript-managed staging with hagiscript ${hagiscriptVersion}`);
}
