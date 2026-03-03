import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Search, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

interface DiagnosisButtonProps {
  className?: string;
}

declare global {
  interface Window {
    electronAPI: {
      diagnosisOpenPrompt: () => Promise<{ success: boolean; error?: string }>;
    };
  }
}

const DiagnosisButton: React.FC<DiagnosisButtonProps> = ({ className = '' }) => {
  const { t } = useTranslation('common');
  const [buttonState, setButtonState] = useState<ButtonState>('idle');

  const handleClick = async () => {
    setButtonState('loading');

    try {
      const result = await window.electronAPI.diagnosisOpenPrompt();

      if (result.success) {
        setButtonState('success');
        toast.success(t('diagnosis.toast.success') || 'AI 诊断已启动');
        setTimeout(() => setButtonState('idle'), 2000);
      } else {
        setButtonState('error');
        toast.error(result.error || t('diagnosis.toast.error') || '启动 AI 诊断失败');
        setTimeout(() => setButtonState('idle'), 3000);
      }
    } catch (error) {
      setButtonState('error');
      toast.error(t('diagnosis.toast.error') || '启动 AI 诊断失败');
      setTimeout(() => setButtonState('idle'), 3000);
    }
  };

  const getButtonContent = () => {
    switch (buttonState) {
      case 'loading':
        return (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t('diagnosis.button.loading') || '正在启动...'}
          </>
        );
      case 'success':
        return (
          <>
            <CheckCircle className="w-4 h-4 mr-2" />
            {t('diagnosis.button.success') || '已启动'}
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="w-4 h-4 mr-2" />
            {t('diagnosis.button.retry') || '重试'}
          </>
        );
      default:
        return (
          <>
            <Search className="w-4 h-4 mr-2" />
            {t('diagnosis.button.text') || '启动遇到问题？点这里让AI看看'}
          </>
        );
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      disabled={buttonState === 'loading'}
      className={`
        w-full relative overflow-hidden
        inline-flex items-center justify-center
        px-6 py-3 rounded-xl
        font-medium text-sm
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-offset-2
        ${buttonState === 'idle'
          ? 'bg-primary/10 hover:bg-primary/20 text-primary'
          : buttonState === 'loading'
            ? 'bg-primary/20 text-primary cursor-wait'
            : buttonState === 'success'
              ? 'bg-green-500/10 text-green-600'
              : 'bg-destructive/10 text-destructive'
        }
        ${buttonState === 'idle'
          ? 'focus:ring-primary/50'
          : buttonState === 'loading'
            ? ''
            : buttonState === 'success'
              ? 'focus:ring-green-500/50'
              : 'focus:ring-destructive/50'
        }
        shadow-sm hover:shadow-md
        ${className}
      `}
      aria-label={t('diagnosis.button.ariaLabel') || '启动 AI 问题诊断'}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={buttonState}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center"
        >
          {getButtonContent()}
        </motion.div>
      </AnimatePresence>

      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 opacity-0 pointer-events-none"
        animate={
          buttonState === 'loading'
            ? {
                background: [
                  'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.05) 50%, transparent 100%)',
                  'linear-gradient(90deg, transparent 100%, rgba(59, 130, 246, 0.05) 0%, transparent 0%)',
                ],
              }
            : {}
        }
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
    </motion.button>
  );
};

export default DiagnosisButton;
