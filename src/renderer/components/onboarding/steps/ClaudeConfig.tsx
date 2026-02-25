import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle, ExternalLink, Eye, EyeOff, AlertTriangle, RefreshCw, Loader2, Globe, Info } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { openInBrowser } from '../../../lib/api-endpoints';
import {
  detectExistingConfig,
  validateApiKey,
  verifyCliInstallation,
  saveClaudeConfig,
  setProvider,
  setApiKey,
  setEndpoint,
  setModelHaiku,
  setModelSonnet,
  setModelOpus,
  clearValidationError,
  fetchPreset,
  refreshPreset,
} from '../../../store/slices/claudeConfigSlice';
import {
  selectClaudeConfigState,
  selectProvider,
  selectApiKey,
  selectEndpoint,
  selectModelHaiku,
  selectModelSonnet,
  selectModelOpus,
  selectIsValidating,
  selectIsValid,
  selectValidationError,
  selectCliStatus,
  selectShowExistingConfig,
  selectPreset,
  selectPresetStatus,
  selectIsPresetLoading,
  selectPresetSource,
  selectRecommendedProviders,
  selectProviderById,
  selectHasChanges,
  selectIsFormComplete,
} from '../../../store/slices/claudeConfigSlice';
import type { RootState, AppDispatch } from '../../../store';

interface ClaudeConfigStepProps {
  onNext: () => void;
  onSkip: () => void;
}

function ClaudeConfigStep({ onNext, onSkip }: ClaudeConfigStepProps) {
  const { t } = useTranslation('claude');
  const dispatch = useDispatch<AppDispatch>();

  // Select state
  const {
    provider,
    apiKey,
    endpoint,
    isValidating,
    isValid,
    validationError,
    cliStatus,
    showExistingConfig,
    hasChanges,
    modelHaiku,
    modelSonnet,
    modelOpus,
  } = useSelector(selectClaudeConfigState);

  // Select presets state
  const presets = useSelector(selectPreset);
  const presetsStatus = useSelector(selectPresetStatus);
  const isPresetsLoading = useSelector(selectIsPresetLoading);
  const recommendedProviders = useSelector(selectRecommendedProviders);
  const presetsSource = useSelector(selectPresetSource);
  const isFormComplete = useSelector(selectIsFormComplete);

  // Local state
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRefreshButton, setShowRefreshButton] = useState(false);
  const [hasTestedClaude, setHasTestedClaude] = useState(false);

  // Fetch presets and detect existing config on mount
  useEffect(() => {
    const initConfig = async () => {
      // First detect existing config
      await dispatch(detectExistingConfig());
      // Then load presets
      await dispatch(fetchPreset());
    };

    initConfig();
  }, [dispatch]);

  // Load model mappings from preset when provider or presets change
  useEffect(() => {
    if (!presets || presetsStatus !== 'success') return;

    const providerPreset = presets?.types['claude-code']?.providers?.[provider];

    if (providerPreset?.defaultModels) {
      // Only set models if they are currently empty (preserve user-entered values)
      if (!modelHaiku) {
        dispatch(setModelHaiku(providerPreset.defaultModels.haiku || ''));
      }
      if (!modelSonnet) {
        dispatch(setModelSonnet(providerPreset.defaultModels.sonnet || ''));
      }
      if (!modelOpus) {
        dispatch(setModelOpus(providerPreset.defaultModels.opus || ''));
      }
    }
  }, [provider, presets, presetsStatus, dispatch, modelHaiku, modelSonnet, modelOpus]);

  // Handle provider change
  const handleProviderChange = async (newProviderId: string) => {
    dispatch(setProvider(newProviderId as 'anthropic' | 'zai' | 'aliyun' | 'minimax' | 'custom'));

    // Get provider preset data - use existing presets state
    const providerPreset = presets?.types['claude-code']?.providers?.[newProviderId];

    // Auto-fill endpoint based on provider preset
    if (providerPreset && providerPreset.apiUrl?.codingPlanForAnthropic && newProviderId !== 'anthropic') {
      dispatch(setEndpoint(providerPreset.apiUrl.codingPlanForAnthropic));
    } else {
      dispatch(setEndpoint(''));
    }

    // Auto-fill model mappings from preset
    if (providerPreset?.defaultModels) {
      dispatch(setModelHaiku(providerPreset.defaultModels.haiku || ''));
      dispatch(setModelSonnet(providerPreset.defaultModels.sonnet || ''));
      dispatch(setModelOpus(providerPreset.defaultModels.opus || ''));
    } else {
      // Clear model mappings if no preset
      dispatch(setModelHaiku(''));
      dispatch(setModelSonnet(''));
      dispatch(setModelOpus(''));
    }

    // Clear validation
    dispatch(clearValidationError());
  };

  // Handle API key input
  const handleApiKeyChange = (value: string) => {
    dispatch(setApiKey(value));
    dispatch(clearValidationError());
  };

  // Handle endpoint input
  const handleEndpointChange = (value: string) => {
    dispatch(setEndpoint(value));
    dispatch(clearValidationError());
  };

  // Handle model mapping inputs
  const handleModelHaikuChange = (value: string) => {
    dispatch(setModelHaiku(value));
  };

  const handleModelSonnetChange = (value: string) => {
    dispatch(setModelSonnet(value));
  };

  const handleModelOpusChange = (value: string) => {
    dispatch(setModelOpus(value));
  };

  // Handle validate
  const handleValidate = async () => {
    await dispatch(validateApiKey({ provider, apiKey, endpoint: endpoint || undefined }));
  };

  // Save and proceed
  const handleSaveAndProceed = async () => {
    // Only save if user has made changes to the config
    if (hasChanges) {
      await dispatch(saveClaudeConfig());
    }
    onNext();
  };

  // Skip with warning
  const handleSkip = () => {
    onSkip();
  };

  // Test Claude configuration by opening terminal
  const handleTestClaude = async () => {
    setHasTestedClaude(true);
    try {
      const result = await window.electronAPI.claudeTest();
      if (!result.success) {
        console.error('[ClaudeConfig] Failed to test Claude:', result.error);
      }
    } catch (error) {
      console.error('[ClaudeConfig] Error testing Claude:', error);
    }
  };

  // Handle refresh presets
  const handleRefreshPresets = async () => {
    setShowRefreshButton(true);
    await dispatch(refreshPreset());
    setTimeout(() => setShowRefreshButton(false), 1000);
  };

  // Open external link
  const handleOpenExternalLink = (url: string) => {
    window.open(url, '_blank');
  };

  // Mask API key for display
  const maskApiKey = (key: string) => {
    if (!key || key.length < 8) return key;
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  };

  // Get provider config for display
  const getProviderConfig = () => {
    // Use existing presets state instead of useSelector inside function
    const providerPreset = presets?.types['claude-code']?.providers?.[provider];

    if (!providerPreset) {
      // Fallback to default config
      return {
        name: t(`provider.${provider}`),
        description: t('provider.defaultDescription'),
        apiUrl: '',
        recommended: false,
        region: 'global',
        referralUrl: '#',
        documentationUrl: '#',
      };
    }

    return {
      name: providerPreset.name || t(`provider.${provider}`),
      description: providerPreset.description || t('provider.defaultDescription'),
      apiUrl: providerPreset.apiUrl?.codingPlanForAnthropic || '',
      recommended: providerPreset.recommended || false,
      region: providerPreset.region || 'global',
      referralUrl: providerPreset.referralUrl || '#',
      documentationUrl: providerPreset.documentationUrl || '#',
    };
  };

  // Get region badge color
  const getRegionBadgeColor = (region: string) => {
    switch (region) {
      case 'cn':
        return 'bg-blue-500/10 text-blue-50';
      case 'us':
        return 'bg-purple-500/10 text-purple-50';
      case 'eu':
        return 'bg-green-500/10 text-green-50';
      default:
        return 'bg-gray-500/10 text-gray-50';
    }
  };

  // Get region label
  const getRegionLabel = (region: string) => {
    switch (region) {
      case 'cn':
        return 'CN';
      case 'us':
        return 'US';
      case 'eu':
        return 'EU';
      default:
        return 'GLOBAL';
    }
  };

  // Get preset source label
  const getPresetSourceLabel = () => {
    if (!presetsSource) {
      return '';
    }
    switch (presetsSource) {
      case 'remote':
        return t('presets.source.remote');
      case 'cache':
        return t('presets.source.cache');
      case 'bundle':
        return t('presets.source.bundle');
      case 'fallback':
        return t('presets.source.fallback');
      default:
        return '';
    }
  };

  // Get preset source badge color
  const getPresetSourceBadgeColor = () => {
    if (!presetsSource) {
      return 'bg-gray-500/10 text-gray-500';
    }
    switch (presetsSource) {
      case 'remote':
        return 'bg-green-500/10 text-green-500';
      case 'cache':
        return 'bg-blue-500/10 text-blue-500';
      case 'bundle':
        return 'bg-purple-500/10 text-purple-500';
      case 'fallback':
        return 'bg-orange-500/10 text-orange-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  // Render provider options
  const renderProviderOptions = () => {
    // If presets failed to load or are still loading, show loading or error state
    if (isPresetsLoading || !presets) {
      return (
        <option value="">
          {t('provider.loading')}
        </option>
      );
    }

    const providers = Object.values(presets.types['claude-code']?.providers || {});

    // If no providers loaded (remote fetch failed), only show custom option
    if (providers.length === 0) {
      return (
        <option value="custom">{t('provider.custom')}</option>
      );
    }

    return (
      <>
        {providers.map((p) => (
          <option key={p.path} value={p.path.split('/')[0]}>
            {p.name}
          </option>
        ))}
        <option value="custom">{t('provider.custom')}</option>
      </>
    );
  };

  // Open promo link using system browser
  const handleOpenPromoLink = async () => {
    const promoConfig = getProviderConfig();
    if (promoConfig.referralUrl && promoConfig.referralUrl !== '#') {
      const result = await openInBrowser(promoConfig.referralUrl);
      if (!result.success) {
        console.error('[ClaudeConfig] Failed to open promo link:', result.error);
      }
    }
  };

  // Get promo link label
  const getPromoLinkLabel = () => {
    const promoConfig = getProviderConfig();
    if (promoConfig.referralUrl && promoConfig.referralUrl === promoConfig.documentationUrl) {
      return t('provider.viewDocs');
    }
    return t('provider.getFreeToken');
  };

  // Get provider description
  const getProviderDescription = () => {
    return getProviderConfig().description;
  };

  // Render configuration form (always show the form, with optional existing config notice)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {t('description')}
        </p>
      </div>

      {/* Preset Status Indicator */}
      {(presetsStatus === 'loading' || presetsStatus === 'error') && (
        <div className={`flex items-center gap-2 text-sm mb-4 ${
          presetsStatus === 'error'
            ? 'text-red-600 bg-red-500/10 rounded-lg p-3'
            : 'text-blue-600 bg-blue-500/10 rounded-lg p-3'
        }`}>
          {presetsStatus === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
          <AlertTriangle className="h-5 w-5" />
          <span>
            {presetsStatus === 'loading' && t('presets.loading')}
            {presetsStatus === 'error' && (presets.error || t('presets.loadFailed'))}
          </span>
        </div>
      )}

      {/* Existing config notice */}
      {showExistingConfig && isValid && (
        <div className="flex items-center gap-2 text-green-600 bg-green-500/10 rounded-lg p-3">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm">{t('presets.autoFilled')}</span>
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="provider">{t('provider.label')} *</Label>
          <div className="flex items-center gap-2">
            <select
              id="provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as any)}
              className="flex-1 px-3 py-2 rounded-md border border-input bg-background"
              disabled={isPresetsLoading}
            >
              {renderProviderOptions()}
            </select>
            {recommendedProviders.some(p => p.providerId === provider) && (
              <span className="ml-2 inline-flex items-center bg-yellow-500/20 text-yellow-50 text-xs px-2 py-1 rounded-full">
                {t('provider.recommended')}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRefreshPresets}
              disabled={showRefreshButton || isPresetsLoading}
              title={t('presets.refresh')}
            >
              {showRefreshButton && isPresetsLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            {presetsSource && presetsSource !== 'remote' && (
              <div
                className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full cursor-help"
                title={getPresetSourceLabel()}
              >
                <Info className="h-3 w-3" />
                <span>{getPresetSourceLabel()}</span>
              </div>
            )}
          </div>
        </div>
        {getProviderConfig().description && (
          <p className="text-sm text-muted-foreground">
            {getProviderConfig().description}
          </p>
        )}
      </div>

      {/* API Key Input */}
      <div className="space-y-2">
        <Label htmlFor="apiKey">{t('apiKey.label')} *</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={t('apiKey.placeholder')}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {getProviderConfig().referralUrl && getProviderConfig().referralUrl !== '#' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenPromoLink}
              className="gap-2 whitespace-nowrap"
            >
              <ExternalLink className="h-4 w-4" />
              {getPromoLinkLabel()}
            </Button>
          )}
          {getProviderConfig().documentationUrl && getProviderConfig().documentationUrl !== '#' && getProviderConfig().documentationUrl !== getProviderConfig().referralUrl && (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenExternalLink(getProviderConfig().documentationUrl!)}
              className="gap-2 whitespace-nowrap"
            >
              <ExternalLink className="h-4 w-4" />
              {t('provider.viewDocs')}
            </Button>
          )}
        </div>
      </div>

      {/* Endpoint Input (for non-anthropic providers) */}
      {provider !== 'anthropic' && (
        <div className="space-y-2">
          <Label htmlFor="endpoint">{t('endpoint.label')}</Label>
          <Input
            id="endpoint"
            type="text"
            value={endpoint}
            onChange={(e) => handleEndpointChange(e.target.value)}
            placeholder={t('endpoint.placeholder')}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground">
            {provider === 'custom' ? t('endpoint.customHint') : t('endpoint.autoFilled')}
          </p>
        </div>
      )}

      {/* Model Mappings */}
      <div className="space-y-4">
        <Label>{t('modelMapping.label') || 'Model Mappings'}</Label>
        <div className="grid grid-cols-3 gap-4">
          {/* Haiku Model */}
          <div className="space-y-2">
            <Label htmlFor="modelHaiku" className="text-xs text-muted-foreground">
              {t('modelMapping.haiku') || 'Haiku'}
            </Label>
            <Input
              id="modelHaiku"
              type="text"
              value={modelHaiku}
              onChange={(e) => handleModelHaikuChange(e.target.value)}
              placeholder={t('modelMapping.placeholder') || 'claude-3-haiku'}
              className="font-mono text-sm"
            />
          </div>
          {/* Sonnet Model */}
          <div className="space-y-2">
            <Label htmlFor="modelSonnet" className="text-xs text-muted-foreground">
              {t('modelMapping.sonnet') || 'Sonnet'}
            </Label>
            <Input
              id="modelSonnet"
              type="text"
              value={modelSonnet}
              onChange={(e) => handleModelSonnetChange(e.target.value)}
              placeholder={t('modelMapping.placeholder') || 'claude-3-5-sonnet'}
              className="font-mono text-sm"
            />
          </div>
          {/* Opus Model */}
          <div className="space-y-2">
            <Label htmlFor="modelOpus" className="text-xs text-muted-foreground">
              {t('modelMapping.opus') || 'Opus'}
            </Label>
            <Input
              id="modelOpus"
              type="text"
              value={modelOpus}
              onChange={(e) => handleModelOpusChange(e.target.value)}
              placeholder={t('modelMapping.placeholder') || 'claude-3-5-opus'}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('modelMapping.description') || 'Configure the models to use for each tier. Leave empty to use default.'}
        </p>
      </div>

      {/* Test Claude Button - Only validation method, disabled when form incomplete */}
      <Button
        variant="default"
        onClick={handleTestClaude}
        disabled={!isFormComplete}
        className={`w-full gap-2 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 border-0 ${
          isFormComplete
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
            : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
        }`}
        size="lg"
      >
        <ExternalLink className="h-5 w-5" />
        <span className="text-base">{t('testClaude')}</span>
        <span className="text-xs opacity-75">({t('testClaude.subtext')})</span>
      </Button>

      {/* Validation Error */}
      {validationError && (
        <div className="flex items-start gap-2 text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{validationError}</span>
        </div>
      )}

      {/* Validation Success & CLI Status */}
      {isValid && (
        <div className="space-y-3">
          {cliStatus && (
            <div className={`flex items-center gap-2 rounded-lg p-3 ${
              cliStatus.installed ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'
            }`}>
              {cliStatus.installed ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span>{t('cli.installed', { version: cliStatus.version })}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5" />
                  <span>{t('cli.notInstalled')}</span>
                </>
              )}
            </div>
          )}

          <div className="bg-muted/20 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm">{t('summary.title')}</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('provider.label')}:</span>
                <div className="flex items-center gap-2">
                  <span>{getProviderConfig().name}</span>
                  {getProviderConfig().recommended && (
                    <span className="ml-2 inline-flex items-center bg-yellow-500/20 text-yellow-50 text-xs px-2 py-1 rounded-full">
                      {t('provider.recommended')}
                    </span>
                  )}
                  {getProviderConfig().region && getProviderConfig().region !== 'global' && (
                    <span className="ml-2 inline-flex items-center text-xs px-2 py-1 rounded bg-muted">
                      <Globe className="h-4 w-4 mr-1" />
                      {getRegionLabel(getProviderConfig().region)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('apiKey.label')}:</span>
                <span className="font-mono">{maskApiKey(apiKey)}</span>
              </div>
              {endpoint && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('endpoint.label')}:</span>
                  <span className="font-mono text-xs truncate max-w-xs">{endpoint}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-center pt-4">
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-muted-foreground"
        >
          {t('skip')}
        </Button>
        <Button
          onClick={handleSaveAndProceed}
          disabled={!isValid && !hasTestedClaude}
          size="lg"
          className="gap-2"
        >
          {t('next')}
        </Button>
      </div>
    </div>
  );
}

export default ClaudeConfigStep;