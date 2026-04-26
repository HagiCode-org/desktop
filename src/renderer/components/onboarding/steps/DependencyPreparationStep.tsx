import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, PackageOpen, RefreshCw } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { npmInstallableAgentCliPackages } from '../../../../shared/npm-managed-packages.js';
import type { ManagedNpmPackageId } from '../../../../types/dependency-management.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import type { AppDispatch, RootState } from '../../../store';
import {
  selectOnboardingDependencyReadiness,
  selectOnboardingSelectedAgentCliPackageIds,
  setOnboardingDependencyProgress,
  setSelectedAgentCliPackageIds,
} from '../../../store/slices/onboardingSlice';
import {
  installOnboardingDependencyPackages,
  loadOnboardingDependencySnapshot,
  refreshOnboardingDependencySnapshot,
} from '../../../store/thunks/onboardingThunks';

function uniquePackageIds(ids: ManagedNpmPackageId[]): ManagedNpmPackageId[] {
  return Array.from(new Set(ids));
}

export default function DependencyPreparationStep() {
  const { t } = useTranslation(['onboarding', 'common']);
  const dispatch = useDispatch<AppDispatch>();
  const readiness = useSelector((state: RootState) => selectOnboardingDependencyReadiness(state));
  const selectedAgentCliPackageIds = useSelector((state: RootState) => selectOnboardingSelectedAgentCliPackageIds(state));
  const dependencySnapshotStatus = useSelector((state: RootState) => state.onboarding.dependencySnapshotStatus);
  const dependencyOperationProgress = useSelector((state: RootState) => state.onboarding.dependencyOperationProgress);
  const dependencyOperationError = useSelector((state: RootState) => state.onboarding.dependencyOperationError);
  const isDependencyOperationActive = useSelector((state: RootState) => state.onboarding.isDependencyOperationActive);
  const latestProgress = Object.values(dependencyOperationProgress).at(-1);
  const environmentAvailable = readiness?.environmentAvailable ?? false;
  const hasSelectedAgentCli = selectedAgentCliPackageIds.length > 0;
  const packagesToInstall = readiness
    ? uniquePackageIds([
      ...readiness.missingRequiredPackageIds,
      ...readiness.missingSelectedAgentCliPackageIds,
    ])
    : [];
  const confirmDisabled = !environmentAvailable || isDependencyOperationActive || !hasSelectedAgentCli;
  const openNodeEnvironmentFaq = () => {
    void window.electronAPI.openExternal(t('onboarding:dependencyPreparation.environment.faqUrl'));
  };

  useEffect(() => {
    if (dependencySnapshotStatus === 'idle') {
      void dispatch(loadOnboardingDependencySnapshot());
    }
  }, [dispatch, dependencySnapshotStatus]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.dependencyManagement.onProgress((event) => {
      dispatch(setOnboardingDependencyProgress(event));
    });

    return () => {
      unsubscribe();
    };
  }, [dispatch]);

  const toggleAgentCli = (packageId: ManagedNpmPackageId, checked: boolean) => {
    dispatch(setSelectedAgentCliPackageIds(
      checked
        ? uniquePackageIds([...selectedAgentCliPackageIds, packageId])
        : selectedAgentCliPackageIds.filter((id) => id !== packageId),
    ));
  };

  const installMissing = () => {
    if (packagesToInstall.length === 0) {
      void dispatch(refreshOnboardingDependencySnapshot());
      return;
    }
    void dispatch(installOnboardingDependencyPackages(packagesToInstall));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-muted-foreground">{t('onboarding:dependencyPreparation.description')}</p>
        <Alert>
          <PackageOpen className="h-4 w-4" />
          <AlertTitle>{t('onboarding:dependencyPreparation.environment.title')}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t('onboarding:dependencyPreparation.environment.description')}</p>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={openNodeEnvironmentFaq}>
              <ExternalLink className="h-4 w-4" />
              {t('onboarding:dependencyPreparation.environment.faqLinkLabel')}
            </Button>
          </AlertDescription>
        </Alert>
      </div>

      {dependencySnapshotStatus === 'loading' && !readiness && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('onboarding:dependencyPreparation.loading')}
          </CardContent>
        </Card>
      )}

      {readiness && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('onboarding:dependencyPreparation.required.title')}</CardTitle>
              <CardDescription>{t('onboarding:dependencyPreparation.required.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {readiness.requiredPackages.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{item.definition.displayName}</p>
                    <p className="text-xs text-muted-foreground">{item.packageName}</p>
                  </div>
                  <Badge variant={item.status === 'installed' ? 'default' : 'destructive'}>
                    {t(`common:dependencyManagement.packageStatus.${item.status}`)}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('onboarding:dependencyPreparation.agentCli.title')}</CardTitle>
              <CardDescription>{t('onboarding:dependencyPreparation.agentCli.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {npmInstallableAgentCliPackages.map((definition) => {
                const item = readiness.agentCliPackages.find((candidate) => candidate.id === definition.id);
                return (
                  <label key={definition.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      checked={selectedAgentCliPackageIds.includes(definition.id)}
                      onCheckedChange={(checked) => toggleAgentCli(definition.id, checked === true)}
                      disabled={isDependencyOperationActive}
                    />
                    <span className="flex-1">
                      <span className="block font-medium">{definition.displayName}</span>
                      <span className="block text-xs text-muted-foreground">{definition.packageName}</span>
                    </span>
                    <Badge variant={item?.status === 'installed' ? 'default' : 'secondary'}>
                      {t(`common:dependencyManagement.packageStatus.${item?.status ?? 'unknown'}`)}
                    </Badge>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {readiness?.blockingReasons.map((reason) => (
        <Alert key={reason.code} variant={reason.code === 'environment-unavailable' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t(`onboarding:dependencyPreparation.blocking.${reason.code}.title`)}</AlertTitle>
          <AlertDescription>{t(`onboarding:dependencyPreparation.blocking.${reason.code}.description`)}</AlertDescription>
        </Alert>
      ))}

      {readiness?.ready && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>{t('onboarding:dependencyPreparation.complete.title')}</AlertTitle>
          <AlertDescription>{t('onboarding:dependencyPreparation.complete.description')}</AlertDescription>
        </Alert>
      )}

      {latestProgress && isDependencyOperationActive && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {latestProgress.message}
          </div>
          <Progress value={latestProgress.percentage ?? 20} />
        </div>
      )}

      {dependencyOperationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('onboarding:dependencyPreparation.error.title')}</AlertTitle>
          <AlertDescription>{dependencyOperationError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={installMissing} disabled={confirmDisabled}>
          {isDependencyOperationActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
          {readiness?.ready ? t('onboarding:dependencyPreparation.actions.recheck') : t('onboarding:dependencyPreparation.actions.install')}
        </Button>
        <Button variant="outline" onClick={() => void dispatch(refreshOnboardingDependencySnapshot())} disabled={isDependencyOperationActive}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('onboarding:dependencyPreparation.actions.refresh')}
        </Button>
      </div>
    </div>
  );
}
