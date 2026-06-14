#!/usr/bin/env node

import { main } from './run-electron-forge-lib.js';

main().catch(error => {
  console.error(`[electron-forge] ${error.message}`);
  process.exit(1);
});
