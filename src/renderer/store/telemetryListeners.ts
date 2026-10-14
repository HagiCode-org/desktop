import type { TypedStartListening } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from './index';
import { normalizeDesktopLanguageCode } from '../../shared/desktop-languages.js';
import type { TelemetryCatalogEventName, TelemetryEventProperties } from '../../shared/telemetry-events.js';
import { OnboardingStep } from '../../types/onboarding.js';
import { trackEvent } from '../telemetry.js';
import { changeLanguage } from './thunks/i18nThunks.js';
import { switchSource } from './thunks/packageSourceThunks.js';
import { setServiceRegion } from './thunks/serviceRegionThunks.js';
import { switchView } from './slices/viewSlice.js';
import { completeInstall, startInstall } from './slices/dependencySlice.js';
import { installDependency, installSingleDependency } from './thunks/dependencyThunks.js';
import {
  acceptLegalDocuments,
  completeOnboarding,
  declineLegalDocuments,
  downloadPackage,
  skipOnboarding,
} from './thunks/onboardingThunks.js';

type Emit = <N extends TelemetryCatalogEventName>(name: N, properties: TelemetryEventProperties<N>) => void;
type Listening = TypedStartListening<RootState, AppDispatch>;
type OutcomeStatus = 'success' | 'failure';

const ONBOARDING_STEP_IDS = {
  [OnboardingStep.LanguageSelection]: 'language_selection',
  [OnboardingStep.Welcome]: 'welcome',
  [OnboardingStep.LegalConsent]: 'legal_consent',
  [OnboardingStep.Download]: 'download',
} as const;

export function registerTelemetryListeners(startListening: Listening, emit: Emit = trackEvent): void {
  startListening({
    actionCreator: switchView,
    effect: (action, listenerApi) => {
      const previousView = listenerApi.getOriginalState().view.currentView;
      if (previousView === action.payload) return;
      emit('view_entered', { view: action.payload, previousView });
    },
  });

  startListening({
    predicate: (_action, currentState, originalState) =>
      currentState.onboarding.currentStep !== originalState.onboarding.currentStep,
    effect: (_action, listenerApi) => {
      const step = listenerApi.getState().onboarding.currentStep;
      emit('onboarding_step_entered', { step: ONBOARDING_STEP_IDS[step] });
    },
  });

  startListening({
    actionCreator: acceptLegalDocuments.fulfilled,
    effect: () => emit('onboarding_legal_decided', { decision: 'accepted' }),
  });

  startListening({
    actionCreator: declineLegalDocuments.fulfilled,
    effect: () => emit('onboarding_legal_decided', { decision: 'declined' }),
  });

  startListening({
    actionCreator: skipOnboarding.fulfilled,
    effect: () => emit('onboarding_skipped', {}),
  });

  startListening({
    actionCreator: completeOnboarding.fulfilled,
    effect: () => emit('onboarding_completed', {}),
  });

  const downloadStartedAt = new Map<string, number>();
  const emitDownloadFinished = (requestId: string, status: OutcomeStatus) => {
    const startedAt = downloadStartedAt.get(requestId);
    if (startedAt === undefined) return;
    downloadStartedAt.delete(requestId);
    emit('onboarding_download_finished', { status, duration: Date.now() - startedAt });
  };

  startListening({
    actionCreator: downloadPackage.pending,
    effect: (action) => {
      downloadStartedAt.set(action.meta.requestId, Date.now());
    },
  });

  startListening({
    actionCreator: downloadPackage.fulfilled,
    effect: (action) => emitDownloadFinished(action.meta.requestId, 'success'),
  });

  startListening({
    actionCreator: downloadPackage.rejected,
    effect: (action) => emitDownloadFinished(action.meta.requestId, 'failure'),
  });

  startListening({
    actionCreator: changeLanguage.fulfilled,
    effect: (action) => {
      const language = normalizeDesktopLanguageCode(action.payload);
      if (language) emit('language_changed', { language });
    },
  });

  startListening({
    actionCreator: switchSource.fulfilled,
    effect: (action, listenerApi) => {
      if (action.payload !== true) return;
      const config = listenerApi.getState().packageSource.allConfigs.find((entry) => entry.id === action.meta.arg);
      if (config) emit('package_source_switched', { sourceKind: config.type });
    },
  });

  startListening({
    actionCreator: setServiceRegion.fulfilled,
    effect: (action) => {
      if (action.payload.success) emit('service_region_changed', { region: action.meta.arg });
    },
  });

  let pendingDependencyCount: number | undefined;

  startListening({
    actionCreator: startInstall,
    effect: (action) => {
      pendingDependencyCount = action.payload;
    },
  });

  startListening({
    actionCreator: completeInstall,
    effect: (action) => {
      if (pendingDependencyCount === undefined) return;
      const count = pendingDependencyCount;
      pendingDependencyCount = undefined;
      emit('dependency_install_finished', {
        status: action.payload.status === 'success' ? 'success' : 'failure',
        count,
      });
    },
  });

  startListening({
    actionCreator: installDependency.fulfilled,
    effect: (action) => emit('dependency_install_finished', {
      status: action.payload ? 'success' : 'failure',
      count: 1,
    }),
  });

  startListening({
    actionCreator: installDependency.rejected,
    effect: () => emit('dependency_install_finished', { status: 'failure', count: 1 }),
  });

  startListening({
    actionCreator: installSingleDependency.fulfilled,
    effect: (action) => emit('dependency_install_finished', {
      status: action.payload.success ? 'success' : 'failure',
      count: 1,
    }),
  });

  startListening({
    actionCreator: installSingleDependency.rejected,
    effect: () => emit('dependency_install_finished', { status: 'failure', count: 1 }),
  });
}
