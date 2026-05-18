import { motion } from 'motion/react';
import { Play, Monitor, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import hagicodeIcon from '../assets/hagicode-icon.png';

interface HagicodeActionButtonProps {
  isRunning: boolean;
  isDisabled: boolean;
  status: string;
  onStart: () => void;
  onOpenApp: () => void;
  onOpenBrowser: () => void;
  canLaunchService?: boolean;
  startLabel?: string;
  isWaitingForPort?: boolean;
  waitingPort?: number | null;
  waitingPhaseMessage?: string | null;
}

export default function HagicodeActionButton({
  isRunning,
  isDisabled,
  status,
  onStart,
  onOpenApp,
  onOpenBrowser,
  canLaunchService = true,
  startLabel,
  isWaitingForPort = false,
  waitingPort,
  waitingPhaseMessage,
}: HagicodeActionButtonProps) {
  const { t } = useTranslation(['components', 'tray']);

  const isStarting = status === 'starting';
  const isStopping = status === 'stopping';
  const isTransitioning = isStarting || isStopping;

  // Stopped state - Start button
  if (!isRunning) {
    if (!canLaunchService) {
      return null;
    }

    return (
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        onClick={onStart}
        disabled={isDisabled}
        whileHover={{ scale: 1.01, y: -2 }}
        whileTap={{ scale: 0.99 }}
        className={`
          relative w-full h-16 rounded-xl overflow-hidden
          font-semibold text-base
          transition-all duration-300
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {/* Animated gradient background */}
        <motion.div
          className="absolute inset-0 bg-linear-to-r from-primary via-primary to-primary/80"
          animate={{
            background: isDisabled
              ? 'linear-gradient(to right, var(--primary), var(--primary))'
              : [
                  'linear-gradient(to right, var(--primary), var(--primary))',
                  'linear-gradient(to right, var(--primary), oklch(from var(--primary) l(+5%)))',
                  'linear-gradient(to right, var(--primary), var(--primary))',
                ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Animated shimmer effect */}
        {!isDisabled && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: 'easeInOut' }}
          />
        )}

        {/* Glow effect */}
        {!isDisabled && (
          <motion.div
            className="absolute inset-0 blur-xl"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              background: 'radial-gradient(circle at center, var(--primary) 0%, transparent 70%)',
            }}
          />
        )}

        {/* Content */}
        <div className="relative z-10 flex items-center justify-center gap-4 h-full text-primary-foreground">
          {/* Hagicode Icon */}
          <motion.img
            src={hagicodeIcon}
            alt="Hagicode"
            className="w-8 h-8"
            animate={isTransitioning ? { rotate: 360 } : { scale: [1, 1.1, 1] }}
            transition={{ duration: isTransitioning ? 1 : 2, repeat: isTransitioning ? 0 : Infinity, ease: 'easeInOut' }}
          />

          {/* Play icon or loader */}
          <div className="flex items-center gap-2">
            {isTransitioning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t(isStopping ? 'webServiceStatus.status.stopping' : 'webServiceStatus.status.starting')}</span>
              </>
            ) : (
              <>
                <motion.div
                  animate={{ x: [0, 6, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 0.3 }}
                >
                  <Play className="w-5 h-5" fill="currentColor" />
                </motion.div>
                <span className="text-lg">{startLabel ?? t('webServiceStatus.startButton')}</span>
              </>
            )}
          </div>

          {/* Separator */}
        </div>

        {/* Subtle border */}
        <div className="absolute inset-0 rounded-xl border-2 border-primary-foreground/20 pointer-events-none" />
      </motion.button>
    );
  }

  if (isWaitingForPort) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        aria-disabled="true"
        className="relative flex min-h-16 w-full cursor-not-allowed items-center justify-center gap-4 overflow-hidden rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-muted-foreground"
      >
        <div className="absolute inset-0 bg-linear-to-r from-muted/30 via-primary/5 to-muted/30" />
        <Loader2 className="relative z-10 h-5 w-5 animate-spin text-primary" />
        <div className="relative z-10 space-y-1 text-center sm:text-left">
          <div className="font-semibold text-foreground">{t('webServiceStatus.portWaiting.title')}</div>
          <div className="text-xs">
            {waitingPort
              ? t('webServiceStatus.portWaiting.detailWithPort', { port: waitingPort })
              : t('webServiceStatus.portWaiting.detail')}
          </div>
          {waitingPhaseMessage && (
            <div className="text-xs text-muted-foreground/80">{waitingPhaseMessage}</div>
          )}
        </div>
      </motion.div>
    );
  }

  // Running state - Open buttons
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Open in App Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={onOpenApp}
        disabled={isDisabled}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        className={`
          relative h-16 rounded-xl overflow-hidden
          font-semibold text-sm
          transition-all duration-300
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {/* Background with gradient */}
        <div className="absolute inset-0 bg-linear-to-br from-primary/90 to-primary/70" />

        {/* Glow effect */}
        {!isDisabled && (
          <motion.div
            className="absolute inset-0 blur-xl"
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ background: 'radial-gradient(circle at center, var(--primary) 0%, transparent 70%)' }}
          />
        )}

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-1 h-full text-primary-foreground">
          <Monitor className="w-6 h-6" />
          <span className="font-medium">{t('tray.openInApp')}</span>
        </div>

        {/* Border */}
        <div className="absolute inset-0 rounded-xl border border-primary-foreground/20 pointer-events-none" />
      </motion.button>

      {/* Open in Browser Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, delay: 0.05 }}
        onClick={onOpenBrowser}
        disabled={isDisabled}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        className={`
          relative h-16 rounded-xl overflow-hidden
          font-semibold text-sm
          bg-card border-2 border-border/50
          hover:border-primary/50
          transition-all duration-300
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-1 h-full">
          <ExternalLink className="w-6 h-6 text-primary" />
          <span className="font-medium text-foreground">{t('tray.openInBrowser')}</span>
        </div>

        {/* Hover glow */}
        <motion.div
          className="absolute inset-0 rounded-xl bg-primary/5 opacity-0"
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      </motion.button>
    </div>
  );
}
