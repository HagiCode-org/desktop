#!/usr/bin/env node

const fs = require('node:fs');
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('Usage: node scripts/wait-for-dev-ready.js tcp:127.0.0.1:36598 dist/preload/index.mjs dist/main/main.js');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTcpTarget(target) {
  const match = /^tcp:([^:]+):(\d+)$/.exec(target);
  if (!match) {
    return null;
  }
  return {
    host: match[1],
    port: Number.parseInt(match[2], 10),
  };
}

function canConnect({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function isReady(target) {
  const tcpTarget = parseTcpTarget(target);
  if (tcpTarget) {
    return canConnect(tcpTarget);
  }
  return fs.existsSync(target);
}

async function waitForTargets() {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  let missing = targets;

  while (Date.now() < deadline) {
    const checks = await Promise.all(targets.map(async (target) => ({
      target,
      ready: await isReady(target),
    })));
    missing = checks.filter((check) => !check.ready).map((check) => check.target);

    if (missing.length === 0) {
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for: ${missing.join(', ')}`);
}

waitForTargets().catch((error) => {
  console.error(`[wait-for-dev-ready] ${error.message}`);
  process.exit(1);
});

