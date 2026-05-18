#!/usr/bin/env node
import { runDelegatedRuntimeScript } from './runtime-script-proxy.mjs';

await runDelegatedRuntimeScript('configure-code-server.mjs');
