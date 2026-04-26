import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OnboardingStep,
  type OnboardingState,
  type ResolvedLegalDocumentsPayload,
} from '../../../../types/onboarding.js';
import reducer, {
  getOnboardingSequence,
  selectCanGoNext,
  selectLegalDocuments,
  selectLegalMetadataSource,
  setDownloadProgress,
} from '../onboardingSlice.js';
import {
  acceptLegalDocuments,
  checkOnboardingTrigger,
  goToNextStep,
  goToPreviousStep,
  loadLegalDocuments,
} from '../../thunks/onboardingThunks.js';

const legalDocumentsPayload: ResolvedLegalDocumentsPayload = {
  schemaVersion: '1.0.0',
  publishedAt: '2026-04-15T00:00:00.000Z',
  resolvedLocale: 'zh-CN',
  source: 'cache',
  cachedAt: '2026-04-15T01:00:00.000Z',
  lastSuccessfulFetchAt: '2026-04-15T00:59:00.000Z',
  documents: [
    {
      documentType: 'eula',
      title: '终端用户许可协议（EULA）',
      effectiveDate: '2026-04-15',
      revision: '2026-04-15',
      canonicalUrl: 'https://docs.hagicode.com/legal/eula/',
      browserOpenUrl: 'https://docs.hagicode.com/legal/eula/',
    },
    {
      documentType: 'privacy-policy',
      title: '隐私政策',
      effectiveDate: '2026-04-15',
      revision: '2026-04-15',
      canonicalUrl: 'https://docs.hagicode.com/legal/privacy-policy/',
      browserOpenUrl: 'https://docs.hagicode.com/legal/privacy-policy/',
    },
  ],
};

describe('onboardingSlice flow', () => {
  it('uses the five-step onboarding sequence in full mode', () => {
    assert.equal(OnboardingStep.Welcome, 0);
    assert.equal(OnboardingStep.LegalConsent, 1);
    assert.equal(OnboardingStep.SharingAcceleration, 2);
    assert.equal(OnboardingStep.NpmPreparation, 3);
    assert.equal(OnboardingStep.Download, 4);
    assert.equal('Launch' in OnboardingStep, false);
    assert.deepEqual(getOnboardingSequence('full'), [
      OnboardingStep.Welcome,
      OnboardingStep.LegalConsent,
      OnboardingStep.SharingAcceleration,
      OnboardingStep.NpmPreparation,
      OnboardingStep.Download,
    ]);
  });

  it('opens the legal-only gate on trigger results that require consent only', () => {
    const state = reducer(
      undefined,
      checkOnboardingTrigger.fulfilled(
        {
          shouldShow: true,
          mode: 'legal-only',
          reason: 'legal-consent-required',
          runtimeProvisioned: true,
          metadataSource: 'cache',
        },
        'request-id',
        undefined,
      ),
    );

    assert.equal(state.isActive, true);
    assert.equal(state.mode, 'legal-only');
    assert.equal(state.currentStep, OnboardingStep.LegalConsent);
    assert.deepEqual(getOnboardingSequence(state.mode), [OnboardingStep.LegalConsent]);
  });

  it('advances from welcome to legal consent before sharing acceleration', () => {
    let state = reducer(
      undefined,
      checkOnboardingTrigger.fulfilled(
        {
          shouldShow: true,
          mode: 'full',
          reason: 'runtime-onboarding-required',
          runtimeProvisioned: false,
          metadataSource: 'remote',
        },
        'request-id',
        undefined,
      ),
    );

    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.LegalConsent);
    assert.equal(selectCanGoNext({ onboarding: state as OnboardingState }), false);
  });

  it('advances from legal consent to sharing acceleration after acceptance', () => {
    let state = reducer(
      undefined,
      checkOnboardingTrigger.fulfilled(
        {
          shouldShow: true,
          mode: 'full',
          reason: 'runtime-onboarding-required',
          runtimeProvisioned: false,
          metadataSource: 'remote',
        },
        'request-id',
        undefined,
      ),
    );
    state = reducer(state, goToNextStep());

    state = reducer(
      state,
      acceptLegalDocuments.fulfilled(
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
        'request-id',
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
      ),
    );

    assert.equal(state.currentStep, OnboardingStep.SharingAcceleration);
    assert.equal(selectCanGoNext({ onboarding: state as OnboardingState }), true);
  });

  it('stores remote or cached legal metadata for the consent step', () => {
    const state = reducer(
      undefined,
      loadLegalDocuments.fulfilled(legalDocumentsPayload, 'request-id', { locale: 'zh-CN', refresh: false }),
    );

    assert.equal(selectLegalMetadataSource({ onboarding: state as OnboardingState }), 'cache');
    assert.equal(selectLegalDocuments({ onboarding: state as OnboardingState }).length, 2);
  });

  it('closes the wizard after legal-only acceptance', () => {
    const initial = reducer(
      undefined,
      checkOnboardingTrigger.fulfilled(
        {
          shouldShow: true,
          mode: 'legal-only',
          reason: 'legal-consent-required',
          runtimeProvisioned: true,
          metadataSource: 'remote',
        },
        'request-id',
        undefined,
      ),
    );

    const accepted = reducer(
      initial,
      acceptLegalDocuments.fulfilled(
        {
          mode: 'legal-only',
          locale: 'en-US',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
        'request-id',
        {
          mode: 'legal-only',
          locale: 'en-US',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
      ),
    );

    assert.equal(accepted.isActive, false);
    assert.equal(accepted.mode, 'none');
  });

  it('keeps the flow on download after the package is ready so the wizard can finish there', () => {
    let state = reducer(
      undefined,
      checkOnboardingTrigger.fulfilled(
        {
          shouldShow: true,
          mode: 'full',
          reason: 'runtime-onboarding-required',
          runtimeProvisioned: false,
          metadataSource: 'remote',
        },
        'request-id',
        undefined,
      ),
    );
    state = reducer(state, goToNextStep());
    state = reducer(
      state,
      acceptLegalDocuments.fulfilled(
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
        'request-id',
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
      ),
    );
    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.NpmPreparation);
    assert.equal(selectCanGoNext({ onboarding: state as OnboardingState }), false);

    const blockedAtNpmPreparation = reducer(state, goToNextStep());
    assert.equal(blockedAtNpmPreparation.currentStep, OnboardingStep.NpmPreparation);

    state = reducer(
      {
        ...state,
        isNpmPreparationComplete: true,
      },
      goToNextStep(),
    );
    assert.equal(state.currentStep, OnboardingStep.Download);

    const blockedAtDownload = reducer(state, goToNextStep());
    assert.equal(blockedAtDownload.currentStep, OnboardingStep.Download);

    const readyToLaunch = reducer(
      state,
      setDownloadProgress({
        progress: 100,
        downloadedBytes: 1024,
        totalBytes: 1024,
        speed: 0,
        remainingSeconds: 0,
        version: 'v1.0.0',
      }),
    );
    const finishedAtDownload = reducer(readyToLaunch, goToNextStep());

    assert.equal(finishedAtDownload.currentStep, OnboardingStep.Download);
  });

  it('navigates back from download to welcome across the inserted legal and npm steps', () => {
    let state = reducer(
      undefined,
      checkOnboardingTrigger.fulfilled(
        {
          shouldShow: true,
          mode: 'full',
          reason: 'runtime-onboarding-required',
          runtimeProvisioned: false,
          metadataSource: 'remote',
        },
        'request-id',
        undefined,
      ),
    );
    state = reducer(state, goToNextStep());
    state = reducer(
      state,
      acceptLegalDocuments.fulfilled(
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
        'request-id',
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
      ),
    );
    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.NpmPreparation);

    state = reducer(
      {
        ...state,
        isNpmPreparationComplete: true,
      },
      goToNextStep(),
    );
    assert.equal(state.currentStep, OnboardingStep.Download);

    const backToNpmPreparation = reducer(state, goToPreviousStep());
    assert.equal(backToNpmPreparation.currentStep, OnboardingStep.NpmPreparation);

    const backToSharing = reducer(backToNpmPreparation, goToPreviousStep());
    assert.equal(backToSharing.currentStep, OnboardingStep.SharingAcceleration);

    const backToLegal = reducer(backToSharing, goToPreviousStep());
    assert.equal(backToLegal.currentStep, OnboardingStep.LegalConsent);

    const backToWelcome = reducer(backToLegal, goToPreviousStep());
    assert.equal(backToWelcome.currentStep, OnboardingStep.Welcome);
  });

  it('only enables next on download after the package is ready', () => {
    let state = reducer(
      undefined,
      checkOnboardingTrigger.fulfilled(
        {
          shouldShow: true,
          mode: 'full',
          reason: 'runtime-onboarding-required',
          runtimeProvisioned: false,
          metadataSource: 'remote',
        },
        'request-id',
        undefined,
      ),
    );
    state = reducer(state, goToNextStep());
    state = reducer(
      state,
      acceptLegalDocuments.fulfilled(
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
        'request-id',
        {
          mode: 'full',
          locale: 'zh-CN',
          documents: legalDocumentsPayload.documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
          })),
        },
      ),
    );
    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.NpmPreparation);

    state = reducer(
      {
        ...state,
        isNpmPreparationComplete: true,
      },
      goToNextStep(),
    );
    state = reducer(
      state,
      setDownloadProgress({
        progress: 100,
        downloadedBytes: 1024,
        totalBytes: 1024,
        speed: 0,
        remainingSeconds: 0,
        version: 'v1.0.0',
      }),
    );

    assert.equal(selectCanGoNext({ onboarding: state as OnboardingState }), true);
  });
});
