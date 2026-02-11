import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { X, Download } from 'lucide-react';
import {
  selectPendingDependencies,
  selectInstallConfirmVersionId,
  selectShowInstallConfirm,
} from '../store/slices/dependencySlice';
import { installFromManifest } from '../store/thunks/dependencyThunks';

interface DependencyInstallWarningBannerProps {
  onDismiss?: () => void;
}

/**
 * Banner shown after package installation when dependencies are missing
 * This is different from DependencyWarningBanner which shows during service startup
 */
export function DependencyInstallWarningBanner({ onDismiss }: DependencyInstallWarningBannerProps) {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();

  const showConfirm = useSelector(selectShowInstallConfirm);
  const dependencies = useSelector(selectPendingDependencies);
  const versionId = useSelector(selectInstallConfirmVersionId);

  const handleInstallNow = () => {
    if (versionId) {
      dispatch(installFromManifest(versionId));
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  // Only show if dialog is visible and there are dependencies
  if (!showConfirm || dependencies.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning" className="relative">
      <div className="flex items-start gap-3 pr-8">
        <Download className="h-5 w-5 text-accent-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-medium text-sm">
            {t('depInstallWarningBanner.title')}
          </div>
          <AlertDescription className="text-xs mt-1">
            {t('depInstallWarningBanner.message', { count: dependencies.length })}
          </AlertDescription>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={handleInstallNow}
              className="h-7"
            >
              <Download className="h-3 w-3 mr-1" />
              {t('depInstallWarningBanner.installNow')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              className="h-7"
            >
              {t('depInstallWarningBanner.dismiss')}
            </Button>
          </div>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
}
