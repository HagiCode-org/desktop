import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle, ExternalLink, Eye, EyeOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { getApiUrl, getApiEndpointConfig, openInBrowser } from '../../../lib/api-endpoints';
import { getPromoLinkConfig } from '../../../lib/promo-links';
import {
  detectExistingConfig,
  validateApiKey,
  verifyCliInstallation,
  saveClaudeConfig,
  setProvider,
  setApiKey,
  setEndpoint,
  clearValidationError,
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
  } = useSelector((state: RootState) => state.claudeConfig);

  // Local state
  const [showApiKey, setShowApiKey] = useState(false);

  // Detect existing config on mount and auto-fill form
  useEffect(() => {
    const detectAndAutoFill = async () => {
      const result = await dispatch(detectExistingConfig());
      if (result.payload && (result.payload as any).exists) {
        // Existing config found - auto-validate it
        const config = result.payload as any;
        await dispatch(validateApiKey({
          provider: config.provider || provider,
          apiKey: config.apiKey || apiKey,
          endpoint: config.endpoint || endpoint
        }));
        await dispatch(verifyCliInstallation());
      }
    };
    detectAndAutoFill();
  }, [dispatch]);

  // Handle provider change
  const handleProviderChange = (newProvider: 'anthropic' | 'zhipu' | 'aliyun' | 'custom') => {
    dispatch(setProvider(newProvider));

    // Auto-fill endpoint based on provider
    if (newProvider !== 'custom') {
      const endpointUrl = getApiUrl(newProvider);
      dispatch(setEndpoint(endpointUrl));
    } else {
      dispatch(setEndpoint(''));
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

  // Validate configuration
  const handleValidate = async () => {
    await dispatch(validateApiKey({ provider, apiKey, endpoint: endpoint || undefined }));
    if (isValid) {
      // Verify CLI after successful validation
      await dispatch(verifyCliInstallation());
    }
  };

  // Save and proceed
  const handleSaveAndProceed = async () => {
    await dispatch(saveClaudeConfig());
    onNext();
  };

  // Skip with warning
  const handleSkip = () => {
    onSkip();
  };

  // Test Claude configuration by opening terminal
  const handleTestClaude = async () => {
    try {
      const result = await window.electronAPI.claudeTest();
      if (!result.success) {
        console.error('[ClaudeConfig] Failed to test Claude:', result.error);
      }
    } catch (error) {
      console.error('[ClaudeConfig] Error testing Claude:', error);
    }
  };

  // Open promo link using system browser
  const handleOpenPromoLink = async () => {
    const promoConfig = getPromoLinkConfig(provider);
    if (promoConfig.url && promoConfig.url !== '#') {
      const result = await openInBrowser(promoConfig.url);
      if (!result.success) {
        console.error('[ClaudeConfig] Failed to open promo link:', result.error);
      }
    }
  };

  // Get promo link label
  const getPromoLinkLabel = () => {
    const promoConfig = getPromoLinkConfig(provider);
    return promoConfig.label;
  };

  // Get provider description
  const getProviderDescription = () => {
    const config = getApiEndpointConfig(provider);
    return config.description;
  };

  // Mask API key for display
  const maskApiKey = (key: string) => {
    if (!key || key.length < 8) return key;
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
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

      {/* Existing config notice */}
      {showExistingConfig && isValid && (
        <div className="flex items-center gap-2 text-green-600 bg-green-500/10 rounded-lg p-3">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm">已检测到现有配置并自动填充</span>
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-2">
        <Label htmlFor="provider">{t('provider.label')} *</Label>
        <select
          id="provider"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as any)}
          className="w-full px-3 py-2 rounded-md border border-input bg-background"
        >
          <option value="anthropic">{t('provider.anthropic')}</option>
          <option value="zhipu">{t('provider.zhipu')}</option>
          <option value="aliyun">{t('provider.aliyun')}</option>
          <option value="custom">{t('provider.custom')}</option>
        </select>
        <p className="text-sm text-muted-foreground">
          {getProviderDescription()}
        </p>
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
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenPromoLink}
            disabled={!getPromoLinkConfig(provider).url || getPromoLinkConfig(provider).url === '#'}
            className="gap-2 whitespace-nowrap"
          >
            <ExternalLink className="h-4 w-4" />
            {getPromoLinkLabel()}
          </Button>
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

      {/* Validation Button */}
      <Button
        onClick={handleValidate}
        disabled={isValidating || !apiKey}
        variant={isValid ? 'default' : 'outline'}
        className="w-full"
      >
        {isValidating ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            {t('validating')}
          </>
        ) : isValid ? (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            {t('validation.valid')}
          </>
        ) : (
          t('validation.validate')
        )}
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
          <div className="flex items-center gap-2 text-green-600 bg-green-500/10 rounded-lg p-3">
            <CheckCircle className="h-5 w-5" />
            <span>{t('validation.success')}</span>
          </div>

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

          {/* Test Claude Button - Prominent Style */}
          <Button
            variant="default"
            onClick={handleTestClaude}
            className="w-full gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 border-0"
            size="lg"
          >
            <ExternalLink className="h-5 w-5" />
            <span className="text-base">测试 Claude</span>
            <span className="text-xs opacity-75">(弹出终端执行 claude hi)</span>
          </Button>

          <div className="bg-muted/20 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm">{t('summary.title')}</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('provider.label')}:</span>
                <span>{t(`provider.${provider}`)}</span>
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
          disabled={!isValid}
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