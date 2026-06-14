#!/usr/bin/env node

import { main } from './run-electron-forge-lib.js';

// Node 24 can terminate an otherwise-correct top-level await when Forge keeps its
// work queued on promises without an active handle on Unix runners. Hold the
// process open until the packaging promise settles.
const keepAlive = setInterval(() => {}, 1000);

try {
  await main();
} catch (error) {
  console.error(`[electron-forge] ${error.message}`);
  process.exit(1);
} finally {
  clearInterval(keepAlive);
}
