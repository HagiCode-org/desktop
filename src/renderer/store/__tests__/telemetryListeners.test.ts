import '../../../../scripts/test-loaders/register-renderer-i18n-stub.mjs';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { type AcceptLegalDocumentsPayload, OnboardingStep } from '../../../types/onboarding.js';
import dependencyReducer, { completeInstall, startInstall } from '../slices/dependencySlice.js';
import onboardingReducer, { setCurrentStep } from '../slices/onboardingSlice.js';
import packageSourceReducer, { setAllConfigs } from '../slices/packageSourceSlice.js';
import viewReducer, { switchView } from '../slices/viewSlice.js';

type TelemetryListeners = typeof import('../telemetryListeners.js');
type Listening = Parameters<TelemetryListeners['registerTelemetryListeners']>[0];

let listeners: TelemetryListeners;
let i18n: typeof import('../thunks/i18nThunks.js');
let dependency: typeof import('../thunks/dependencyThunks.js');
let onboarding: typeof import('../thunks/onboardingThunks.js');
let packageSource: typeof import('../thunks/packageSourceThunks.js');
let serviceRegion: typeof import('../thunks/serviceRegionThunks.js');

before(async () => {
  [listeners, i18n, dependency, onboarding, packageSource, serviceRegion] = await Promise.all([
    import('../telemetryListeners.js'),
    import('../thunks/i18nThunks.js'),
    import('../thunks/dependencyThunks.js'),
    import('../thunks/onboardingThunks.js'),
    import('../thunks/packageSourceThunks.js'),
    import('../thunks/serviceRegionThunks.js'),
  ]);
});

interface Emitted {
  name: string;
  properties: unknown;
}

function setup() {
  const emitted: Emitted[] = [];
  const listenerMiddleware = createListenerMiddleware();
  listeners.registerTelemetryListeners(
    listenerMiddleware.startListening as unknown as Listening,
    (name, properties) => {
      emitted.push({ name, properties });
    },
  );
  const store = configureStore({
    reducer: {
      view: viewReducer,
      onboarding: onboardingReducer,
      packageSource: packageSourceReducer,
      dependency: dependencyReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listenerMiddleware.middleware),
  });
  return { store, emitted };
}

describe('telemetry listeners', () => {
  it('emits view_entered with the previous view when the main view changes', () => {
    const { store, emitted } = setup();

    store.dispatch(switchView('settings'));

    assert.deepEqual(emitted, [
      { name: 'view_entered', properties: { view: 'settings', previousView: 'system' } },
    ]);
  });

  it('emits no view_entered when switching to the already active view', () => {
    const { store, emitted } = setup();

    store.dispatch(switchView('system'));

    assert.deepEqual(emitted, []);
  });

  it('emits onboarding_step_entered only when the onboarding step actually changes', () => {
    const { store, emitted } = setup();

    store.dispatch(setCurrentStep(OnboardingStep.Welcome));
    store.dispatch(setCurrentStep(OnboardingStep.LegalConsent));
    store.dispatch(setCurrentStep(OnboardingStep.LegalConsent));

    assert.deepEqual(emitted, [
      { name: 'onboarding_step_entered', properties: { step: 'welcome' } },
      { name: 'onboarding_step_entered', properties: { step: 'legal_consent' } },
    ]);
  });

  it('emits onboarding_legal_decided only for fulfilled accept and decline outcomes', () => {
    const { store, emitted } = setup();
    const acceptPayload: AcceptLegalDocumentsPayload = { locale: 'en-US', mode: 'full', documents: [] };

    store.dispatch(onboarding.acceptLegalDocuments.rejected({ message: 'failed' }, 'accept-1', acceptPayload));
    store.dispatch(onboarding.acceptLegalDocuments.fulfilled(acceptPayload, 'accept-2', acceptPayload));
    store.dispatch(onboarding.declineLegalDocuments.fulfilled({ success: true }, 'decline-1', undefined));

    assert.deepEqual(emitted.filter((event) => event.name === 'onboarding_legal_decided'), [
      { name: 'onboarding_legal_decided', properties: { decision: 'accepted' } },
      { name: 'onboarding_legal_decided', properties: { decision: 'declined' } },
    ]);
  });

  it('emits onboarding_skipped and onboarding_completed on their fulfilled outcomes', () => {
    const { store, emitted } = setup();

    store.dispatch(onboarding.skipOnboarding.fulfilled({ success: true }, 'skip-1', undefined));
    store.dispatch(onboarding.completeOnboarding.fulfilled({ success: true }, 'complete-1', 'version-1'));

    assert.deepEqual(emitted, [
      { name: 'onboarding_skipped', properties: {} },
      { name: 'onboarding_completed', properties: {} },
    ]);
  });

  it('reports one onboarding download outcome per requestId', () => {
    const { store, emitted } = setup();

    store.dispatch(onboarding.downloadPackage.pending('download-1', undefined));
    store.dispatch(onboarding.downloadPackage.fulfilled({ success: true }, 'download-1', undefined));
    store.dispatch(onboarding.downloadPackage.fulfilled({ success: true }, 'download-1', undefined));
    store.dispatch(onboarding.downloadPackage.rejected({ message: 'late' }, 'download-1', undefined));

    const finished = emitted.filter((event) => event.name === 'onboarding_download_finished');
    assert.equal(finished.length, 1);
    const properties = finished[0].properties as { status: string; duration: number };
    assert.equal(properties.status, 'success');
    assert.ok(Number.isInteger(properties.duration) && properties.duration >= 0);
  });

  it('reports a failed onboarding download and ignores outcomes without a pending start', () => {
    const { store, emitted } = setup();

    store.dispatch(onboarding.downloadPackage.fulfilled({ success: true }, 'orphan', undefined));
    store.dispatch(onboarding.downloadPackage.pending('download-2', undefined));
    store.dispatch(onboarding.downloadPackage.rejected({ message: 'network' }, 'download-2', undefined));

    const finished = emitted.filter((event) => event.name === 'onboarding_download_finished');
    assert.equal(finished.length, 1);
    assert.equal((finished[0].properties as { status: string }).status, 'failure');
  });

  it('emits language_changed with the resolved desktop language code', () => {
    const { store, emitted } = setup();

    store.dispatch(i18n.changeLanguage.fulfilled('zh-CN', 'language-1', 'zh-CN'));
    store.dispatch(i18n.changeLanguage.fulfilled('not-a-language', 'language-2', 'not-a-language'));

    assert.deepEqual(emitted, [
      { name: 'language_changed', properties: { language: 'zh-CN' } },
    ]);
  });

  it('emits package_source_switched with the source kind only when the switch succeeds', () => {
    const { store, emitted } = setup();
    store.dispatch(setAllConfigs([
      { type: 'local-folder', id: 'local-source', createdAt: '2026-10-13T00:00:00.000Z', path: '/private/path' },
      { type: 'http-index', id: 'remote-source', createdAt: '2026-10-13T00:00:00.000Z' },
    ]));

    store.dispatch(packageSource.switchSource.fulfilled(false, 'switch-1', 'local-source'));
    store.dispatch(packageSource.switchSource.fulfilled(true, 'switch-2', 'remote-source'));

    assert.deepEqual(emitted, [
      { name: 'package_source_switched', properties: { sourceKind: 'http-index' } },
    ]);
  });

  it('emits service_region_changed with the requested region only when the change succeeds', () => {
    const { store, emitted } = setup();

    store.dispatch(serviceRegion.setServiceRegion.fulfilled({ success: false, error: 'offline' }, 'region-1', 'CN'));
    store.dispatch(serviceRegion.setServiceRegion.fulfilled({ success: true }, 'region-2', 'INTERNATIONAL'));

    assert.deepEqual(emitted, [
      { name: 'service_region_changed', properties: { region: 'INTERNATIONAL' } },
    ]);
  });

  it('reports a dependency batch once with its dependency count', () => {
    const { store, emitted } = setup();

    store.dispatch(startInstall(3));
    store.dispatch(completeInstall({ status: 'success' }));
    store.dispatch(completeInstall({ status: 'error' }));

    assert.deepEqual(emitted, [
      { name: 'dependency_install_finished', properties: { status: 'success', count: 3 } },
    ]);
  });

  it('reports single dependency installs as one-dependency outcomes', () => {
    const { store, emitted } = setup();

    store.dispatch(dependency.installDependency.fulfilled(true, 'install-1', 'nodejs'));
    store.dispatch(dependency.installSingleDependency.fulfilled({ success: false, status: 'error' }, 'install-2', {
      dependencyKey: 'git',
      versionId: 'latest',
    }));
    store.dispatch(dependency.installDependency.rejected({ message: 'boom' }, 'install-3', 'nodejs'));

    assert.deepEqual(emitted, [
      { name: 'dependency_install_finished', properties: { status: 'success', count: 1 } },
      { name: 'dependency_install_finished', properties: { status: 'failure', count: 1 } },
      { name: 'dependency_install_finished', properties: { status: 'failure', count: 1 } },
    ]);
  });
});
