import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import {
  selectCurrentStep,
  selectRegion,
  selectClaudeConfigDetected,
  selectClaudeConfigSource,
  selectClaudeProvider,
  selectIsCallingAPI,
  selectError,
  selectPromptLoaded,
  loadLlmPrompt,
  callClaudeApi,
  detectClaudeConfig,
  getRegion,
  setStep,
  resetState,
  clearError,
  setManifestPath,
} from '@/store/slices/llmInstallationSlice';
import { StepTracker } from './StepTracker';
import { UserConfirmation } from './UserConfirmation';

interface InstallationWizardProps {
  manifestPath: string;
  onClose: () => void;
  onComplete: () => void;
}

const STEP_TITLES = [
  'Preparing',
  'Calling Claude API',
  'Confirm Status',
  'Completed',
];

/**
 * InstallationWizard component manages the progressive installation flow
 * Now delegates to Claude CLI configuration instead of API key input
 */
export const InstallationWizard: React.FC<InstallationWizardProps> = ({
  manifestPath,
  onClose,
  onComplete,
}) => {
  const dispatch = useDispatch<AppDispatch>();

  const currentStep = useSelector(selectCurrentStep);
  const region = useSelector(selectRegion);
  const claudeConfigDetected = useSelector(selectClaudeConfigDetected);
  const claudeConfigSource = useSelector(selectClaudeConfigSource);
  const claudeProvider = useSelector(selectClaudeProvider);
  const isCallingAPI = useSelector(selectIsCallingAPI);
  const error = useSelector(selectError);
  const promptLoaded = useSelector(selectPromptLoaded);

  // Initialize
  useEffect(() => {
    dispatch(setManifestPath(manifestPath));
    dispatch(detectClaudeConfig());
    dispatch(getRegion());
    dispatch(loadLlmPrompt(manifestPath));

    return () => {
      dispatch(resetState());
    };
  }, [dispatch, manifestPath]);

  // Handle Claude API call
  const handleCallApi = async () => {
    dispatch(clearError());
    dispatch(setStep('calling-api'));
    await dispatch(callClaudeApi('Execute the installation check and installation as instructed in the prompt.'));
  };

  // Handle confirmation
  const handleConfirm = () => {
    onComplete();
  };

  // Handle retry
  const handleRetry = () => {
    dispatch(setStep('preparing'));
  };

  // Handle cancel
  const handleCancel = () => {
    onClose();
  };

  // Calculate current step index
  const getStepIndex = () => {
    switch (currentStep) {
      case 'idle':
      case 'preparing':
        return 0;
      case 'calling-api':
        return 1;
      case 'confirmation':
        return 2;
      case 'completed':
      case 'installing':
        return 3;
      case 'error':
        return getStepIndex();
      default:
        return 0;
    }
  };

  // Get provider display name
  const getProviderDisplayName = (provider: string | null) => {
    if (!provider) return 'Unknown';
    const providerNames: Record<string, string> = {
      anthropic: 'Anthropic',
      zai: 'Zhipu AI (智谱)',
      aliyun: 'Aliyun (阿里云)',
      custom: 'Custom',
    };
    return providerNames[provider] || provider;
  };

  // Get source display name
  const getSourceDisplayName = (source: string | null) => {
    if (!source) return '';
    const sourceNames: Record<string, string> = {
      env: 'Environment Variables',
      settings: 'Settings File',
      store: 'Application Store',
    };
    return sourceNames[source] || source;
  };

  return (
    <div className="installation-wizard">
      <div className="wizard-header">
        <h2>Dependency Installation Wizard</h2>
        <button className="close-btn" onClick={handleCancel}>
          &times;
        </button>
      </div>

      <StepTracker
        currentStep={getStepIndex()}
        totalSteps={STEP_TITLES.length}
        stepTitles={STEP_TITLES}
      />

      <div className="wizard-content">
        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={() => dispatch(clearError())}>Dismiss</button>
          </div>
        )}

        {/* Region Display */}
        <div className="region-info">
          <span>Region: {region}</span>
        </div>

        {/* Step Content */}
        {currentStep === 'preparing' && (
          <div className="step-preparing">
            {!claudeConfigDetected ? (
              <div className="claude-config-required">
                <h3>Claude CLI Configuration Required</h3>
                <p>Claude CLI is not configured. To use LLM-powered installation, please configure Claude Code CLI first.</p>
                <p className="hint">You can configure Claude through the onboarding flow.</p>
                <button className="btn-secondary" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="claude-config-status">
                <p>Claude CLI Configured</p>
                {claudeProvider && (
                  <p>Provider: {getProviderDisplayName(claudeProvider)}</p>
                )}
                {claudeConfigSource && (
                  <p>Source: {getSourceDisplayName(claudeConfigSource)}</p>
                )}
                <button className="btn-primary" onClick={handleCallApi} disabled={!promptLoaded || isCallingAPI}>
                  {isCallingAPI ? 'Calling...' : 'Start Installation Check'}
                </button>
              </div>
            )}
          </div>
        )}

        {currentStep === 'calling-api' && (
          <div className="step-calling-api">
            <div className="loading-spinner" />
            <p>Calling Claude API...</p>
            <p className="hint">Claude is analyzing your system and executing installation commands.</p>
          </div>
        )}

        {currentStep === 'confirmation' && (
          <UserConfirmation
            statusMessage="Claude has completed the installation check. Please confirm the results."
            onConfirm={handleConfirm}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        )}

        {currentStep === 'completed' && (
          <div className="step-completed">
            <h3>Installation Complete</h3>
            <p>All dependencies have been checked and installed.</p>
            <button className="btn-primary" onClick={onComplete}>
              Return to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstallationWizard;
