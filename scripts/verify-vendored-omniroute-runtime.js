#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
  validateOmniRouteRuntimePayload,
} from './omniroute-runtime-contract.js';

const config = readOmniRouteRuntimeConfig();
const platformKey = process.env.HAGICODE_OMNIROUTE_PLATFORM || detectOmniRouteRuntimePlatform();
const runtimeRoot = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(process.cwd(), 'resources', 'omniroute', 'current');

if (!fs.existsSync(runtimeRoot)) {
  throw new Error(`Vendored OmniRoute runtime root does not exist: ${runtimeRoot}`);
}

const validation = validateOmniRouteRuntimePayload(runtimeRoot, { platformKey, config });
const errors = [...validation.missingEntries, ...validation.diagnostics];
if (errors.length > 0) {
  throw new Error(`Vendored OmniRoute runtime validation failed:\n- ${errors.join('\n- ')}`);
}

console.log(`[omniroute-runtime] Verified vendored runtime at ${runtimeRoot}`);
