#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';

function log(message) {
  process.stdout.write(`[workflow-artifact] ${message}\n`);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

export function parseArtifactNames(value) {
  if (!value) {
    return [];
  }

  return [...new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )];
}

export function selectArtifact(artifacts, artifactNames) {
  for (const artifactName of artifactNames) {
    const artifact = artifacts.find((entry) => entry.name === artifactName);
    if (artifact) {
      return artifact;
    }
  }

  return null;
}

async function requestJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}) for ${url}`);
  }

  return response.json();
}

async function requestBuffer(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Artifact download failed (${response.status} ${response.statusText}) for ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const options = parseArgs(process.argv);
  const repo = options.repo?.trim();
  const runId = options['run-id']?.trim();
  const artifactNames = parseArtifactNames(options['artifact-name']);
  const outputDir = options['output-dir']?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();

  if (!repo || !runId || artifactNames.length === 0 || !outputDir) {
    throw new Error('Usage: node scripts/download-workflow-artifact.mjs --repo <owner/repo> --run-id <id> --artifact-name <name[,fallback...]> --output-dir <dir>');
  }

  if (!token) {
    throw new Error('GITHUB_TOKEN is required to download workflow artifacts.');
  }

  const listUrl = `https://api.github.com/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`;
  const payload = await requestJson(listUrl, token);
  const artifact = selectArtifact(payload.artifacts ?? [], artifactNames);

  if (!artifact) {
    const availableArtifacts = (payload.artifacts ?? []).map((entry) => entry.name).join(', ') || '<none>';
    throw new Error(`Artifacts "${artifactNames.join(', ')}" were not found in workflow run ${runId}. Available artifacts: ${availableArtifacts}`);
  }

  if (artifact.expired) {
    throw new Error(`Artifact "${artifactName}" from workflow run ${runId} has expired.`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  const archiveUrl = `https://api.github.com/repos/${repo}/actions/artifacts/${artifact.id}/zip`;
  log(`downloading ${artifact.name} from run ${runId}`);
  const archiveBuffer = await requestBuffer(archiveUrl, token);
  const archive = new AdmZip(archiveBuffer);
  archive.extractAllTo(outputDir, true);

  const extractedEntries = archive.getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.entryName)
    .sort();

  log(`extracted ${extractedEntries.length} file(s) to ${path.resolve(outputDir)}`);
  for (const entry of extractedEntries) {
    log(`file: ${entry}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('[workflow-artifact] failed');
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
