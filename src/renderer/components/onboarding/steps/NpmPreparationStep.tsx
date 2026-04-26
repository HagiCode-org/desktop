import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Loader2, PackageOpen, RefreshCw } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { npmInstallableAgentCliPackages } from '../../../../shared/npm-managed-packages.js';
import type { ManagedNpmPackageId } from '../../../../types/npm-management.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import type { AppDispatch, RootState } from '../../../store';
import {
  selectOnboardingNpmReadiness,
  selectOnboardingSelectedAgentCliPackageIds,
  setOnboardingNpmProgress,
  setSelectedAgentCliPackageIds,
} from '../../../store/slices/onboardingSlice';
import {
  installOnboardingNpmPackages,
  loadOnboardingNpmSnapshot,
  refreshOnboardingNpmSnapshot,
} from '../../../store/thunks/onboardingThunks';

function uniquePackageIds(ids: ManagedNpmPackageId[]): ManagedNpmPackageId[] {
  return Array.from(new Set(ids));
}

export default function NpmPreparationStep() {
  const { t } = useTranslation(['onboarding', 'common']);
  const dispatch = useDispatch<AppDispatch>();
  const readiness = useSelector((state: RootState) => selectOnboardingNpmReadiness(state));
  const selectedAgentCliPackageIds = useSelector((state: RootState) => selectOnboardingSelectedAgentCliPackageIds(state));
  const npmSnapshotStatus = useSelector((state: RootState) => state.onboarding.npmSnapshotStatus);
  const npmOperationProgress = useSelector((state: RootState) => state.onboarding.npmOperationProgress);
  const npmOperationError = useSelector((state: RootState) => state.onboarding.npmOperationError);
  const isNpmOperationActive = useSelector((state: RootState) => state.onboarding.isNpmOperationActive);
  const latestProgress = Object.values(npmOperationProgress).at(-1);
  const environmentAvailable = readiness?.environmentAvailable ?? false;
  const hasSelectedAgentCli = selectedAgentCliPackageIds.length > 0;
  const packagesToInstall = readiness
    ? uniquePackageIds([
      ...readiness.missingRequiredPackageIds,
      ...readiness.missingSelectedAgentCliPackageIds,
    ])
    : [];
  const confirmDisabled = !environmentAvailable || isNpmOperationActive || !hasSelectedAgentCli;

  useEffect(() => {
    if (npmSnapshotStatus === 'idle') {
      void dispatch(loadOnboardingNpmSnapshot());
    }
  }, [dispatch, npmSnapshotStatus]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.npmManagement.onProgress((event) => {
      dispatch(setOnboardingNpmProgress(event));
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
      void dispatch(refreshOnboardingNpmSnapshot());
      return;
    }
    void dispatch(installOnboardingNpmPackages(packagesToInstall));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-muted-foreground">{t('onboarding:npmPreparation.description')}</p>
        <Alert>
          <PackageOpen className="h-4 w-4" />
          <AlertTitle>{t('onboarding:npmPreparation.environment.title')}</AlertTitle>
          <AlertDescription>{t('onboarding:npmPreparation.environment.description')}</AlertDescription>
        </Alert>
      </div>

      {npmSnapshotStatus === 'loading' && !readiness && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('onboarding:npmPreparation.loading')}
          </CardContent>
        </Card>
      )}

      {readiness && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('onboarding:npmPreparation.required.title')}</CardTitle>
              <CardDescription>{t('onboarding:npmPreparation.required.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {readiness.requiredPackages.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{item.definition.displayName}</p>
                    <p className="text-xs text-muted-foreground">{item.packageName}</p>
                  </div>
                  <Badge variant={item.status === 'installed' ? 'default' : 'destructive'}>
                    {t(`common:npmManagement.packageStatus.${item.status}`)}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('onboarding:npmPreparation.agentCli.title')}</CardTitle>
              <CardDescription>{t('onboarding:npmPreparation.agentCli.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {npmInstallableAgentCliPackages.map((definition) => {
                const item = readiness.agentCliPackages.find((candidate) => candidate.id === definition.id);
                return (
                  <label key={definition.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      checked={selectedAgentCliPackageIds.includes(definition.id)}
                      onCheckedChange={(checked) => toggleAgentCli(definition.id, checked === true)}
                      disabled={isNpmOperationActive}
                    />
                    <span className="flex-1">
                      <span className="block font-medium">{definition.displayName}</span>
                      <span className="block text-xs text-muted-foreground">{definition.packageName}</span>
                    </span>
                    <Badge variant={item?.status === 'installed' ? 'default' : 'secondary'}>
                      {t(`common:npmManagement.packageStatus.${item?.status ?? 'unknown'}`)}
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
          <AlertTitle>{t(`onboarding:npmPreparation.blocking.${reason.code}.title`)}</AlertTitle>
          <AlertDescription>{t(`onboarding:npmPreparation.blocking.${reason.code}.description`)}</AlertDescription>
        </Alert>
      ))}

      {readiness?.ready && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>{t('onboarding:npmPreparation.complete.title')}</AlertTitle>
          <AlertDescription>{t('onboarding:npmPreparation.complete.description')}</AlertDescription>
        </Alert>
      )}

      {latestProgress && isNpmOperationActive && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {latestProgress.message}
          </div>
          <Progress value={latestProgress.percentage ?? 20} />
        </div>
      )}

      {npmOperationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('onboarding:npmPreparation.error.title')}</AlertTitle>
          <AlertDescription>{npmOperationError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={installMissing} disabled={confirmDisabled}>
          {isNpmOperationActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
          {readiness?.ready ? t('onboarding:npmPreparation.actions.recheck') : t('onboarding:npmPreparation.actions.install')}
        </Button>
        <Button variant="outline" onClick={() => void dispatch(refreshOnboardingNpmSnapshot())} disabled={isNpmOperationActive}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('onboarding:npmPreparation.actions.refresh')}
        </Button>
      </div>
    </div>
  );
}
