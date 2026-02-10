import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { CheckCircle2, Package } from 'lucide-react';
import { DependencyManagementCard } from '../../DependencyManagementCardUnified';
import { selectDownloadProgress } from '../../../store/slices/onboardingSlice';
import { goToNextStep } from '../../../store/thunks/onboardingThunks';
import type { RootState } from '../../../store';
import { useDispatch } from 'react-redux';

function DependencyInstaller() {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch();
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));

  const handleInstallComplete = () => {
    // Automatically proceed to the next step after successful installation
    dispatch(goToNextStep());
  };

  return (
    <div className="space-y-8">
      {/* Status header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Package className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-semibold">
          {t('dependencies.installing.title')}
        </h2>
        <p className="text-muted-foreground">
          {t('dependencies.description')}
        </p>
      </div>

      {/* Unified Dependency Management Card */}
      <DependencyManagementCard
        versionId={downloadProgress?.version || ''}
        context="onboarding"
        onInstallComplete={handleInstallComplete}
        showAdvancedOptions={false}
      />
    </div>
  );
}

export default DependencyInstaller;
