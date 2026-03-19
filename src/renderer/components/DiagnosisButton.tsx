import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import type { PromptGuidanceResponse } from '../../types/prompt-guidance.js';
import { PromptGuidancePanel } from './prompt-guidance';

interface DiagnosisButtonProps {
  className?: string;
}

declare global {
  interface Window {
    electronAPI: {
      diagnosisGetPromptGuidance: () => Promise<PromptGuidanceResponse>;
    };
  }
}

const DiagnosisButton: React.FC<DiagnosisButtonProps> = ({ className = '' }) => {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'resolved'>('idle');
  const [guidance, setGuidance] = useState<PromptGuidanceResponse | null>(null);

  const loadGuidance = async () => {
    setStatus('loading');
    try {
      const nextGuidance = await window.electronAPI.diagnosisGetPromptGuidance();
      setGuidance(nextGuidance);
    } finally {
      setStatus('resolved');
    }
  };

  const handleClick = async () => {
    setOpen(true);
    if (!guidance) {
      await loadGuidance();
    }
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => void handleClick()}
        className={`
          w-full relative overflow-hidden
          inline-flex items-center justify-center
          px-6 py-3 rounded-xl
          font-medium text-sm
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2
          bg-primary/10 hover:bg-primary/20 text-primary
          focus:ring-primary/50
          shadow-sm hover:shadow-md
          ${className}
        `}
        aria-label={t('diagnosis.button.ariaLabel')}
      >
        <div className="flex items-center justify-center">
          <Search className="mr-2 h-4 w-4" />
          {t('diagnosis.button.text')}
        </div>
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{t('diagnosis.dialog.title')}</DialogTitle>
            <DialogDescription>{t('diagnosis.dialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 pb-6">
            <PromptGuidancePanel
              title={t('diagnosis.dialog.panelTitle')}
              description={t('diagnosis.dialog.panelDescription')}
              guidance={guidance}
              status={status}
              onRefresh={loadGuidance}
              compact
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DiagnosisButton;
