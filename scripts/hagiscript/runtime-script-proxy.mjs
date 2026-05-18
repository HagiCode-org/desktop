#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGlobalHagiscriptPackageRoot } from '../global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.2.0';

export async function runDelegatedRuntimeScript(scriptName) {
  const hagiscriptPackageRoot = resolveGlobalHagiscriptPackageRoot(MINIMUM_HAGISCRIPT_VERSION);
  const targetPath = path.join(hagiscriptPackageRoot, 'runtime', 'scripts', scriptName);
  await import(pathToFileURL(targetPath).href);
}
