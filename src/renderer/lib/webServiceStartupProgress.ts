import type { TFunction } from 'i18next';
import { StartupPhase, type ProcessStatus } from '../store/slices/webServiceSlice';

export interface StartupProgressStepDefinition {
  phase: StartupPhase;
  label: string;
  description: string;
}

export function getStartupProgressSteps(t: TFunction<'components'>): StartupProgressStepDefinition[] {
  return [
    {
      phase: StartupPhase.CheckingVersion,
      label: t('webServiceStatus.startupProgress.stepLabels.checkingVersion'),
      description: t('webServiceStatus.startupProgress.stepDescriptions.checkingVersion'),
    },
    {
      phase: StartupPhase.CheckingDependencies,
      label: t('webServiceStatus.startupProgress.stepLabels.checkingDependencies'),
      description: t('webServiceStatus.startupProgress.stepDescriptions.checkingDependencies'),
    },
    {
      phase: StartupPhase.Spawning,
      label: t('webServiceStatus.startupProgress.stepLabels.spawning'),
      description: t('webServiceStatus.startupProgress.stepDescriptions.spawning'),
    },
    {
      phase: StartupPhase.WaitingListening,
      label: t('webServiceStatus.startupProgress.stepLabels.waitingListening'),
      description: t('webServiceStatus.startupProgress.stepDescriptions.waitingListening'),
    },
    {
      phase: StartupPhase.HealthCheck,
      label: t('webServiceStatus.startupProgress.stepLabels.healthCheck'),
      description: t('webServiceStatus.startupProgress.stepDescriptions.healthCheck'),
    },
    {
      phase: StartupPhase.Running,
      label: t('webServiceStatus.startupProgress.stepLabels.running'),
      description: t('webServiceStatus.startupProgress.stepDescriptions.running'),
    },
  ];
}

export function resolveDisplayedStartupPhase(
  status: ProcessStatus,
  phase: StartupPhase,
  failurePhase?: StartupPhase | null,
): StartupPhase {
  if (phase === StartupPhase.Error) {
    return failurePhase ?? StartupPhase.CheckingVersion;
  }

  if (phase === StartupPhase.Idle && status === 'starting') {
    return StartupPhase.CheckingVersion;
  }

  return phase;
}

export function getStartupPhaseSummary(
  t: TFunction<'components'>,
  status: ProcessStatus,
  phase: StartupPhase,
  failurePhase?: StartupPhase | null,
): string {
  const displayedPhase = resolveDisplayedStartupPhase(status, phase, failurePhase);

  switch (displayedPhase) {
    case StartupPhase.CheckingVersion:
      return t('webServiceStatus.startupProgress.stepDescriptions.checkingVersion');
    case StartupPhase.CheckingDependencies:
      return t('webServiceStatus.startupProgress.stepDescriptions.checkingDependencies');
    case StartupPhase.Spawning:
      return t('webServiceStatus.startupProgress.stepDescriptions.spawning');
    case StartupPhase.WaitingListening:
      return t('webServiceStatus.startupProgress.stepDescriptions.waitingListening');
    case StartupPhase.HealthCheck:
      return t('webServiceStatus.startupProgress.stepDescriptions.healthCheck');
    case StartupPhase.Running:
      return t('webServiceStatus.startupProgress.stepDescriptions.running');
    case StartupPhase.Error:
      return t('webServiceStatus.statusDescription.error');
    case StartupPhase.Idle:
    default:
      return status === 'running'
        ? t('webServiceStatus.statusDescription.running')
        : status === 'stopping'
          ? t('webServiceStatus.statusDescription.stopping')
          : status === 'starting'
            ? t('webServiceStatus.startupProgress.stepDescriptions.checkingVersion')
            : t('webServiceStatus.statusDescription.stopped');
  }
}
