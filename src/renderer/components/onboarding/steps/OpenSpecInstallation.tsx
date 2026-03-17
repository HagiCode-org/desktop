import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { AlertTriangle, CheckCircle2, Loader2, Package2, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Button } from '../../ui/button';
import {
  selectCanGoNext,
  selectOpenSpecInstall,
} from '../../../store/slices/onboardingSlice';
import { installOpenSpec, verifyOpenSpec } from '../../../store/thunks/onboardingThunks';
import type { AppDispatch, RootState } from '../../../store';

const INSTALL_COMMAND = 'npm install -g @fission-ai/openspec@1';
const VERIFY_COMMAND = 'openspec --version';

function OpenSpecInstallation() {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const openSpecInstall = useSelector((state: RootState) => selectOpenSpecInstall(state));
  const canGoNext = useSelector((state: RootState) => selectCanGoNext(state));

  const isInstalling = openSpecInstall.status === 'installing';
  const isChecking = openSpecInstall.status === 'checking';
  const isInstalled = openSpecInstall.status === 'installed';
  const isFailed = openSpecInstall.status === 'failed';
  const isBusy = isInstalling || isChecking;

  useEffect(() => {
    if (canGoNext || isInstalling || isChecking) {
      return;
    }

    dispatch(verifyOpenSpec());
  }, [canGoNext, dispatch, isChecking, isInstalling]);

  const handleInstall = () => {
    if (isBusy) {
      return;
    }

    dispatch(installOpenSpec());
  };

  const installButtonLabel = isFailed ? t('openspec.retryButton') : t('openspec.installButton');

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Package2 className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t('openspec.title')}</h2>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
            {t('openspec.description')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border bg-muted/20 p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TerminalSquare className="h-4 w-4 text-primary" />
              <span>{t('openspec.installTitle')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('openspec.installDescription')}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t('openspec.installCommandLabel')}
            </p>
            <div className="rounded-lg border bg-background px-4 py-3 font-mono text-sm break-all">
              {INSTALL_COMMAND}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleInstall} disabled={isBusy} className="gap-2">
              {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package2 className="h-4 w-4" />}
              {isInstalling ? t('openspec.status.installing') : installButtonLabel}
            </Button>
            <div className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              {t('openspec.statusLabel')}: {t(`openspec.status.${openSpecInstall.status}`)}
            </div>
          </div>

          {isInstalled && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>{t('openspec.successTitle')}</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>{t('openspec.successDescription')}</p>
                {openSpecInstall.installedVersion && (
                  <p>{t('openspec.installedVersion', { version: openSpecInstall.installedVersion })}</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {isFailed && openSpecInstall.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('openspec.failureTitle')}</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>{openSpecInstall.error}</p>
                <p>{t('openspec.manualFallback')}</p>
              </AlertDescription>
            </Alert>
          )}
        </section>

        <section className="rounded-lg border bg-background p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>{t('openspec.verifyTitle')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('openspec.verifyDescription')}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t('openspec.verifyCommandLabel')}
            </p>
            <div className="rounded-lg border bg-muted/20 px-4 py-3 font-mono text-sm break-all">
              {VERIFY_COMMAND}
            </div>
          </div>

          <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{t('openspec.versionRangeLabel')}</span>
              <span className="font-mono text-xs">{t('openspec.versionRangeValue')}</span>
            </div>
            <p className="text-muted-foreground">{t('openspec.successCriteria')}</p>
            <p className="text-muted-foreground">{t('openspec.permissionHint')}</p>
            <p className="font-medium text-foreground">
              {canGoNext ? t('openspec.verifyReady') : t('openspec.verifyHint')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default OpenSpecInstallation;
