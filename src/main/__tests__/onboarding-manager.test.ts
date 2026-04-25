import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const onboardingManagerPath = path.resolve(process.cwd(), 'src/main/onboarding-manager.ts');

async function readSource() {
  return fs.readFile(onboardingManagerPath, 'utf-8');
}

describe('onboarding-manager legal consent gating', () => {
  it('adds dedicated legal consent and metadata cache store keys', async () => {
    const source = await readSource();

    assert.match(source, /LEGAL_CONSENT_STORE_KEY = 'legalConsent'/);
    assert.match(source, /LEGAL_METADATA_CACHE_STORE_KEY = 'legalMetadataCache'/);
    assert.match(source, /DEFAULT_LEGAL_METADATA_URL = 'https:\/\/index\.hagicode\.com\/legal-documents\.json'/);
  });

  it('distinguishes full onboarding from legal-only compliance gating', async () => {
    const source = await readSource();

    assert.match(source, /const runtimeProvisioned = this\.versionManager\.isPortableVersionMode\(\) \|\| installedVersions\.length > 0/);
    assert.match(source, /const mode = runtimeProvisioned \? 'legal-only' : 'full'/);
    assert.match(source, /reason: legalMetadata\.payload \? 'legal-consent-required' : 'legal-metadata-unavailable'/);
    assert.match(source, /mode: 'full'/);
  });

  it('persists revision-aware consent independently from onboarding completion', async () => {
    const source = await readSource();

    assert.match(source, /setLegalConsentState\(/);
    assert.match(source, /eulaRevision: currentRevisions\.get\('eula'\) \?\? ''/);
    assert.match(source, /privacyPolicyRevision: currentRevisions\.get\('privacy-policy'\) \?\? ''/);
    assert.match(source, /acceptedFrom: payload\.mode/);
    assert.match(source, /completedAt: this\.now\(\)\.toISOString\(\)/);
  });

  it('falls back to cached legal metadata when the remote payload is unavailable', async () => {
    const source = await readSource();

    assert.match(source, /Failed to fetch legal metadata, trying cache/);
    assert.match(source, /const cacheState = this\.getLegalMetadataCache\(\)/);
    assert.match(source, /source: 'cache'/);
    assert.match(source, /source: 'unavailable'/);
  });

  it('treats portable version mode as already provisioned after consent succeeds', async () => {
    const source = await readSource();

    assert.match(source, /reason: this\.versionManager\.isPortableVersionMode\(\)/);
    assert.match(source, /'portable-version-provisioned'/);
  });

  it('returns a manual-action-required handoff instead of auto-installing dependencies during onboarding', async () => {
    const source = await readSource();

    assert.match(source, /buildManualActionPlan\(initialStatus\)/);
    assert.match(source, /status: 'manual-action-required'/);
    assert.match(source, /Onboarding no longer executes dependency installers automatically/);
    assert.equal(source.includes('installFromManifest('), false);
  });
});
