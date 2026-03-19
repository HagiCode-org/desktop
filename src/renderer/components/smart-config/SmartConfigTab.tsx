import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PromptGuidanceResponse } from '../../../types/prompt-guidance.js';
import { PromptGuidancePanel } from '../prompt-guidance';

interface SmartConfigTabProps {
  defaultPromptPath?: string;
}

declare global {
  interface Window {
    electronAPI: {
      llmGetPromptGuidance: (
        resourceKey: 'smartConfig' | 'diagnosis',
        customPromptPath?: string,
      ) => Promise<PromptGuidanceResponse>;
    };
  }
}

export function SmartConfigTab({ defaultPromptPath }: SmartConfigTabProps) {
  const { t } = useTranslation('pages');
  const [status, setStatus] = useState<'idle' | 'loading' | 'resolved'>('idle');
  const [guidance, setGuidance] = useState<PromptGuidanceResponse | null>(null);

  const loadGuidance = useCallback(async () => {
    setStatus('loading');

    try {
      const customPromptPath = defaultPromptPath?.trim() ? defaultPromptPath.trim() : undefined;
      const nextGuidance = await window.electronAPI.llmGetPromptGuidance('smartConfig', customPromptPath);
      setGuidance(nextGuidance);
    } finally {
      setStatus('resolved');
    }
  }, [defaultPromptPath]);

  useEffect(() => {
    void loadGuidance();
  }, [loadGuidance]);

  return (
    <PromptGuidancePanel
      title={t('settings.smartConfig.title')}
      description={t('settings.smartConfig.description')}
      guidance={guidance}
      status={status}
      onRefresh={loadGuidance}
    />
  );
}

export default SmartConfigTab;
