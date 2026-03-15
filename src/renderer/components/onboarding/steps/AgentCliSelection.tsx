import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { AgentCliType, getAllCliConfigs } from '../../../../types/agent-cli';
import {
  selectAgentCli,
  skipAgentCli,
  selectSelectedCliType,
  selectCanProceed,
} from '../../../store/slices/agentCliSlice';
import type { AppDispatch } from '../../../store';

interface AgentCliSelectionProps {
  onNext: () => void;
  onSkipSelection: () => void;
}

function AgentCliSelection({ onNext, onSkipSelection }: AgentCliSelectionProps) {
  const { t } = useTranslation('agent-cli');
  const dispatch = useDispatch<AppDispatch>();

  const selectedCliType = useSelector(selectSelectedCliType);
  const canProceed = useSelector(selectCanProceed);

  const [showHelp, setShowHelp] = useState(false);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load stored selection on mount
  useEffect(() => {
    async function loadSelection() {
      try {
        setIsLoading(true);
        const stored = await window.electronAPI.agentCliLoad();
        if (stored.cliType) {
          dispatch(selectAgentCli(stored.cliType));
        }
        if (stored.isSkipped) {
          dispatch(skipAgentCli());
        }
      } catch (error) {
        console.error('Failed to load Agent CLI selection:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSelection();
  }, [dispatch]);

  async function handleSelect(cliType: AgentCliType) {
    dispatch(selectAgentCli(cliType));
    // Save selection to store
    try {
      await window.electronAPI.agentCliSave({ cliType });
    } catch (error) {
      console.error('Failed to save Agent CLI selection:', error);
    }
  }

  function handleNext() {
    if (canProceed) {
      onNext();
    }
  }

  function handleSkip() {
    setShowSkipDialog(true);
  }

  async function confirmSkip() {
    dispatch(skipAgentCli());
    try {
      await window.electronAPI.agentCliSkip();
    } catch (error) {
      console.error('Failed to save skip flag:', error);
    }
    setShowSkipDialog(false);
    onSkipSelection();
  }

  const cliConfigs = getAllCliConfigs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">
          {t('title')}
        </h2>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      {/* CLI Options */}
      <div className="space-y-3">
        {cliConfigs.map((config) => {
          const isSelected = selectedCliType === config.cliType;

          return (
            <button
              key={config.cliType}
              onClick={() => handleSelect(config.cliType)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <h3 className="font-semibold">{config.displayName}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {config.description}
                  </p>
                  {config.docsUrl && isSelected && (
                    <a
                      href={config.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline mt-1 inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('viewDocs')}
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Help Section */}
      <div className="border rounded-lg p-4 bg-muted/50">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">💡 {t('help.title')}</span>
          <ChevronRight
            className={`w-4 h-4 transition-transform ${showHelp ? 'rotate-90' : ''}`}
          />
        </button>
        {showHelp && (
          <div className="mt-3 text-sm text-muted-foreground space-y-2">
            <p>{t('help.ensureConfigured')}</p>
            <p>{t('help.configLocation')}</p>
            <p>{t('help.configInstructions')}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <div />
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleSkip}
          >
            {t('skip')}
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed}
          >
            {t('next')}
          </Button>
        </div>
      </div>

      {/* Skip Confirmation Dialog */}
      {showSkipDialog && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 max-w-md shadow-lg">
            <h3 className="text-lg font-semibold mb-2">
              {t('skipConfirm.title')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t('skipConfirm.message')}
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowSkipDialog(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={confirmSkip}
              >
                {t('skipConfirm.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentCliSelection;
