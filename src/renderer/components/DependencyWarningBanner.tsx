import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { X } from 'lucide-react';
import {
  selectShowDependencyWarning,
  selectDependencyWarningDismissed,
  selectMissingDependenciesList,
  setDependencyWarningDismissed,
} from '../store/slices/webServiceSlice';
import { switchView } from '../store/slices/viewSlice';

export default function DependencyWarningBanner() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();

  const showWarning = useSelector(selectShowDependencyWarning);
  const dismissed = useSelector(selectDependencyWarningDismissed);
  const missingDependencies = useSelector(selectMissingDependenciesList);

  if (!showWarning || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    dispatch(setDependencyWarningDismissed(true));
  };

  const handleViewDetails = () => {
    dispatch(switchView('version'));
  };

  const handleFixLater = () => {
    handleDismiss();
  };

  return (
    <Alert variant="warning" className="relative">
      <button
        onClick={handleDismiss}
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>

      <AlertTitle className="flex items-center gap-2">
        <span>⚠️</span>
        {t('dependencyWarningBanner.title')}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">
          {t('dependencyWarningBanner.description', {
            count: missingDependencies.length,
          })}
        </p>

        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={handleViewDetails}>
            {t('dependencyWarningBanner.viewDetails')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleFixLater}>
            {t('dependencyWarningBanner.fixLater')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
