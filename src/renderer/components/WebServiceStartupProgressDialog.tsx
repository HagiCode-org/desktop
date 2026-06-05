import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  getStartupPhaseSummary,
  getStartupProgressSteps,
  resolveDisplayedStartupPhase,
} from '@/lib/webServiceStartupProgress';
import { StartupPhase, type ProcessStatus, type StartupFailurePayload } from '../store/slices/webServiceSlice';

type StepVisualState = 'pending' | 'active' | 'completed' | 'failed';

interface WebServiceStartupProgressDialogProps {
  open: boolean;
  status: ProcessStatus;
  phase: StartupPhase;
  failurePhase?: StartupPhase | null;
  activeVersionLabel?: string | null;
  accessUrl?: string | null;
  port: number;
  errorMessage?: string | null;
  startupFailure: StartupFailurePayload | null;
  onOpenChange: (open: boolean) => void;
  onOpenFailureLog: () => void;
}

function getStepVisualState(
  stepIndex: number,
  activeIndex: number,
  phase: StartupPhase,
): StepVisualState {
  if (phase === StartupPhase.Error) {
    if (stepIndex < activeIndex) {
      return 'completed';
    }

    if (stepIndex === activeIndex) {
      return 'failed';
    }

    return 'pending';
  }

  if (phase === StartupPhase.Running) {
    return 'completed';
  }

  if (stepIndex < activeIndex) {
    return 'completed';
  }

  if (stepIndex === activeIndex) {
    return 'active';
  }

  return 'pending';
}

export default function WebServiceStartupProgressDialog({
  open,
  status,
  phase,
  failurePhase,
  activeVersionLabel,
  accessUrl,
  port,
  errorMessage,
  startupFailure,
  onOpenChange,
  onOpenFailureLog,
}: WebServiceStartupProgressDialogProps) {
  const { t } = useTranslation(['components']);
  const steps = getStartupProgressSteps(t);
  const displayedPhase = resolveDisplayedStartupPhase(status, phase, failurePhase);
  const activeStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.phase === displayedPhase),
  );
  const progressValue = phase === StartupPhase.Running
    ? 100
    : Math.max(10, Math.round(((activeStepIndex + 0.55) / steps.length) * 100));
  const isStarting = status === 'starting';
  const isSuccessful = phase === StartupPhase.Running && status === 'running';
  const isFailed = phase === StartupPhase.Error || Boolean(errorMessage) || Boolean(startupFailure);
  const currentSummary = startupFailure?.summary
    ?? errorMessage
    ?? getStartupPhaseSummary(t, status, phase, failurePhase);
  const currentDetail = currentSummary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="[&>button]:hidden max-w-3xl overflow-hidden border-border/80 p-0 shadow-xl">
        <div className="border-b border-border/70 bg-primary/[0.06] px-6 py-5">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <span
                  className={cn(
                    'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                    isFailed
                      ? 'border-destructive/30 bg-destructive/8 text-destructive'
                      : isSuccessful
                        ? 'border-primary/25 bg-primary/10 text-primary'
                        : 'border-primary/25 bg-primary/10 text-primary',
                  )}
                >
                  {isFailed
                    ? t('webServiceStatus.startupProgress.states.failed')
                    : isSuccessful
                      ? t('webServiceStatus.startupProgress.states.completed')
                      : t('webServiceStatus.startupProgress.states.active')}
                </span>
                <DialogTitle className="text-2xl font-semibold tracking-tight">
                  {isFailed
                    ? t('webServiceStatus.startupProgress.failureTitle')
                    : isSuccessful
                      ? t('webServiceStatus.startupProgress.successTitle')
                      : t('webServiceStatus.startupProgress.title')}
                </DialogTitle>
                <DialogDescription className="max-w-[64ch] text-sm leading-6 text-muted-foreground">
                  {isFailed
                    ? t('webServiceStatus.startupProgress.failureDescription')
                    : isSuccessful
                      ? t('webServiceStatus.startupProgress.successDescription')
                      : t('webServiceStatus.startupProgress.description')}
                </DialogDescription>
              </div>

              <div className="grid min-w-[220px] gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/90 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                    {t('webServiceStatus.startupProgress.meta.version')}
                  </div>
                  <div className="mt-2 font-medium text-foreground">{activeVersionLabel || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/90 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                    {t('webServiceStatus.startupProgress.meta.port')}
                  </div>
                  <div className="mt-2 font-medium text-foreground">{port}</div>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-6">
          <section className="rounded-2xl border border-border/70 bg-muted/[0.22] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('webServiceStatus.startupProgress.currentStepLabel')}
                </p>
                <p className="text-base font-semibold text-foreground">{currentSummary}</p>
                <p className="text-sm text-muted-foreground">{currentDetail}</p>
              </div>
              <div className="text-right text-sm font-medium text-foreground">{progressValue}%</div>
            </div>
            <Progress value={progressValue} className="mt-4 h-2.5" />
            {!isFailed && !isSuccessful ? (
              <p className="mt-3 text-xs text-muted-foreground">{t('webServiceStatus.startupProgress.waitingHint')}</p>
            ) : null}
          </section>

          <section className="space-y-3">
            {steps.map((step, index) => {
              const stepState = getStepVisualState(index, activeStepIndex, phase);

              return (
                <div
                  key={step.phase}
                  className={cn(
                    'flex items-start gap-4 rounded-2xl border px-4 py-3 transition-colors',
                    stepState === 'active' && 'border-primary/30 bg-primary/[0.06]',
                    stepState === 'completed' && 'border-border/70 bg-background',
                    stepState === 'failed' && 'border-destructive/25 bg-destructive/[0.06]',
                    stepState === 'pending' && 'border-border/60 bg-muted/[0.14]',
                  )}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-sm font-semibold text-foreground">
                    {stepState === 'active' ? (
                      <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                    ) : stepState === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : stepState === 'failed' ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{step.label}</p>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                          stepState === 'active' && 'bg-primary/10 text-primary',
                          stepState === 'completed' && 'bg-primary/10 text-primary',
                          stepState === 'failed' && 'bg-destructive/10 text-destructive',
                          stepState === 'pending' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {t(`webServiceStatus.startupProgress.states.${stepState}`)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl border border-border/70 bg-background px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t('webServiceStatus.startupProgress.meta.accessUrl')}
            </div>
            <div className="mt-2 break-all font-mono text-sm text-foreground">{accessUrl || '-'}</div>
          </section>
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/[0.14] px-6 py-4">
          {startupFailure ? (
            <Button type="button" variant="outline" onClick={onOpenFailureLog}>
              {t('webServiceStatus.startupProgress.actions.openFailureLog')}
            </Button>
          ) : null}
          {!isStarting ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('webServiceStatus.startupProgress.actions.close')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
