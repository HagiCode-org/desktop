import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { Bot, CheckCircle2, AlertCircle, Loader2, Terminal, Globe, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { selectSelectedCliType, selectIsSkipped } from '../../../store/slices/agentCliSlice';
import PreconditionError from '../PreconditionError';
import { OnboardingStep } from '../../../../types/onboarding';
import { setCurrentStep } from '../../../store/slices/onboardingSlice';

type Region = 'cn' | 'international';

interface LlmInstallationStepProps {
  onNext: () => void;
  onSkip: () => void;
  onNavigateToOnboarding?: () => void;
  versionId?: string | null;
}

function LlmInstallationStep({ onNext, onSkip, onNavigateToOnboarding, versionId }: LlmInstallationStepProps) {
  const { t } = useTranslation(['onboarding', 'common']);
  const dispatch = useDispatch();

  // Agent CLI selection state for precondition validation
  const selectedCliType = useSelector(selectSelectedCliType);
  const isSkipped = useSelector(selectIsSkipped);

  // Precondition validation error state
  const [hasPreconditionError, setHasPreconditionError] = useState(false);

  // Installation states
  const [stepStatus, setStepStatus] = useState<'idle' | 'calling' | 'awaitingConfirmation' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Region detection and selection
  const [isDetectingRegion, setIsDetectingRegion] = useState(true);
  const [detectedRegion, setDetectedRegion] = useState<Region | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<Region>('international');
  const explicitSelectionRef = useRef(false);

  const toUiRegion = (value: string | null | undefined): Region | null => {
    if (!value) {
      return null;
    }

    if (value === 'CN' || value === 'cn') {
      return 'cn';
    }

    if (value === 'INTERNATIONAL' || value === 'international') {
      return 'international';
    }

    return null;
  };

  // Precondition validation: Check if Agent CLI Selection step is completed
  // This is a safety check to handle edge cases (direct navigation, state reset)
  // The design principle is: once in LlmInstallation step, Claude is assumed usable
  // No validation in selectCanGoNext selector - only component-level safety check here
  useEffect(() => {
    const isPreconditionValid = selectedCliType !== null || isSkipped;
    setHasPreconditionError(!isPreconditionValid);
  }, [selectedCliType, isSkipped]);

  // Handle return to Agent CLI Selection step
  const handleReturnToAgentCli = () => {
    dispatch(setCurrentStep(OnboardingStep.AgentCliSelection));
  };

  const setPreferredRegion = (region: Region, isExplicitSelection: boolean = true) => {
    if (isExplicitSelection) {
      explicitSelectionRef.current = true;
    }
    setSelectedRegion(region);
  };

  const refreshRegionDetection = async () => {
    setIsDetectingRegion(true);
    try {
      const result = await window.electronAPI.llmGetRegion?.();
      const region = toUiRegion(result?.region);

      if (result?.success && region) {
        setDetectedRegion(region);
        if (!explicitSelectionRef.current) {
          setSelectedRegion(region);
        }
      } else {
        setDetectedRegion('international');
        if (!explicitSelectionRef.current) {
          setSelectedRegion('international');
        }
      }
    } catch {
      setDetectedRegion('international');
      if (!explicitSelectionRef.current) {
        setSelectedRegion('international');
      }
    } finally {
      setIsDetectingRegion(false);
    }
  };

  // Detect region on component mount
  useEffect(() => {
    void refreshRegionDetection();
  }, []);

  // Handle region selection and start installation
  const handleSelectRegionAndStart = async (region: Region) => {
    setPreferredRegion(region);
    setStepStatus('calling');
    setError(null);

    try {
      // Build manifest path from version ID using PathManager
      if (!versionId) {
        throw new Error('No version ID available. Please download a package first.');
      }

      // Get manifest path from backend using PathManager
      const manifestPathResult = await window.electronAPI.llmGetManifestPath(versionId);

      if (!manifestPathResult.success || !manifestPathResult.manifestPath) {
        throw new Error(manifestPathResult.error || 'Failed to get manifest path');
      }

      // Call Claude API with manifest path and region
      // The backend will read the manifest, select the appropriate prompt file based on region,
      // and then call Claude CLI with that prompt file
      const apiResponse = await window.electronAPI.llmCallApi(manifestPathResult.manifestPath, region);

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'API call failed');
      }

      // Show confirmation panel instead of automatic completion
      setStepStatus('awaitingConfirmation');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStepStatus('error');
    }
  };

  // Handle retry with currently selected region
  const handleRetry = async () => {
    await handleSelectRegionAndStart(selectedRegion);
  };

  // Handle confirmation - user confirms installation complete
  const handleConfirmInstallation = () => {
    setStepStatus('completed');
    onNext();
  };

  // Handle help - open QQ group
  const handleNeedHelp = () => {
    // Open QQ group for help
    window.open('https://qm.qq.com/q/FoalgKjYOI', '_blank');
  };

  // Handle skip
  const handleSkipClick = () => {
    onSkip();
  };

  // Get region display info
  const getRegionInfo = (region: Region) => {
    if (region === 'cn') {
      return {
        name: t('llmInstallation.region.cn'),
        description: '使用国内 API（智谱 AI、阿里云等）',
        icon: '🇨🇳',
      };
    }
    return {
      name: t('llmInstallation.region.international'),
      description: '使用国际 API（Anthropic 官方）',
      icon: '🌍',
    };
  };

  // Render precondition error UI
  const renderPreconditionError = () => (
    <PreconditionError
      title={t('preconditionError.title')}
      message={t('preconditionError.message')}
      actionLabel={t('preconditionError.action')}
      onAction={handleReturnToAgentCli}
    />
  );

  // Render error display
  const renderErrorDisplay = () => (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <p className="text-sm">{error}</p>
      </div>
    </div>
  );

  // Render region detection UI
  const renderRegionDetection = () => {
    return (
      <>
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {isDetectingRegion ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{t('llmInstallation.region.detecting')}</span>
              </>
            ) : detectedRegion ? (
              <span>
                {t('llmInstallation.region.detected')}: <span className="font-semibold text-foreground">{getRegionInfo(detectedRegion).name}</span>
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refreshRegionDetection()}
              disabled={isDetectingRegion}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {t('mirror.redetect', { ns: 'common' })}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {(['cn', 'international'] as Region[]).map((region) => {
            const info = getRegionInfo(region);
            const isDetected = detectedRegion === region;
            const isSelected = selectedRegion === region;
            return (
              <button
                key={region}
                onClick={() => handleSelectRegionAndStart(region)}
                className={`p-6 rounded-lg border-2 transition-all bg-card ${
                  isSelected ? 'border-primary shadow-sm' : 'hover:border-primary/50'
                }`}
              >
                <div className="text-center space-y-3">
                  <div className="text-4xl">{info.icon}</div>
                  <div>
                    <p className="font-semibold text-lg">{info.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{info.description}</p>
                    {isDetected && (
                      <span className="inline-flex items-center mt-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {t('llmInstallation.region.recommended')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // Render calling UI
  const renderCalling = () => (
    <div className="text-center space-y-4 py-8">
      <Terminal className="h-12 w-12 mx-auto text-green-500" />
      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
      <p className="text-sm text-muted-foreground mt-2">
        {getRegionInfo(selectedRegion).name}
      </p>
    </div>
  );

  // Render waiting confirmation UI
  const renderAwaitingConfirmation = () => (
    <div className="space-y-4 py-4">
      {/* Terminal icon */}
      <div className="text-center mb-4">
        <Terminal className="h-12 w-12 mx-auto text-green-500" />
      </div>

      {/* Confirmation card */}
      <div className="bg-muted/20 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-center">
          {t('installationConfirmation.title')}
        </h3>
        <p className="text-sm text-muted-foreground text-center">
          {t('installationConfirmation.description')}
        </p>

        {/* Current region display with switcher */}
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                当前区域: {getRegionInfo(selectedRegion).name}
              </span>
              <span className="text-2xl">{getRegionInfo(selectedRegion).icon}</span>
            </div>
            <select
              value={selectedRegion}
              onChange={(e) => setPreferredRegion(e.target.value as Region)}
              className="px-3 py-1.5 rounded-md border border-input bg-background text-sm"
            >
              <option value="cn">🇨🇳 {t('llmInstallation.region.cn')}</option>
              <option value="international">🌍 {t('llmInstallation.region.international')}</option>
            </select>
          </div>
        </div>

        {/* Check info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">{t('installationConfirmation.checkTitle')}</p>
              <p className="text-muted-foreground mt-1">
                {t('installationConfirmation.checkDescription')}
              </p>
            </div>
          </div>
        </div>

        {/* Three action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleNeedHelp}
            className="flex-1"
          >
            {t('installationConfirmation.needHelp')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleRetry}
            className="flex-1 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t('installationConfirmation.retry')}
          </Button>
          <Button
            onClick={handleConfirmInstallation}
            className="flex-1 bg-primary text-primary-foreground"
          >
            {t('installationConfirmation.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );

  // Render error UI
  const renderError = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>{t('llmInstallation.error')}</span>
      </div>

      {/* Region selector for retry */}
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">重试区域:</span>
          <select
            value={selectedRegion}
            onChange={(e) => setPreferredRegion(e.target.value as Region)}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm"
          >
            <option value="cn">🇨🇳 {t('llmInstallation.region.cn')}</option>
            <option value="international">🌍 {t('llmInstallation.region.international')}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-center">
        <Button
          onClick={handleRetry}
          variant="outline"
        >
          {t('llmInstallation.retry')}
        </Button>
        <Button
          onClick={handleSkipClick}
          variant="ghost"
          className="text-muted-foreground"
        >
          {t('llmInstallation.skip')}
        </Button>
      </div>
    </div>
  );

  // Render content based on step status
  const renderStepContent = () => {
    switch (stepStatus) {
      case 'idle':
        return renderRegionDetection();
      case 'calling':
        return renderCalling();
      case 'awaitingConfirmation':
        return renderAwaitingConfirmation();
      case 'error':
        return renderError();
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Bot className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-semibold">{t('llmInstallation.title')}</h2>
        <p className="text-muted-foreground">{t('llmInstallation.description')}</p>
      </div>

      {/* Precondition Error - Show instead of main content when validation fails */}
      {hasPreconditionError ? renderPreconditionError() : (
        <>
          {/* Error display */}
          {error && renderErrorDisplay()}

          {/* Step content */}
          {renderStepContent()}
        </>
      )}

      {/* Success message for completed state */}
      {stepStatus === 'completed' && (
        <div className="text-center space-y-4 py-8">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
          <h3 className="text-xl font-semibold">{t('llmInstallation.completed')}</h3>
          <p className="text-muted-foreground">{t('llmInstallation.description')}</p>
        </div>
      )}
    </div>
  );
}

export default LlmInstallationStep;
