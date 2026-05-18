#!/usr/bin/env node
import { runDelegatedRuntimeScript } from './runtime-script-proxy.mjs';

await runDelegatedRuntimeScript('verify-dotnet.mjs');
