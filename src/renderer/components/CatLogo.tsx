import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CatHead } from '@/components/ui/cat-head';
import { CAT_SPRITE_COUNT, shuffleCatOrder } from '@/lib/cat-sprite';
import { cn } from '@/lib/utils';

interface CatLogoProps {
  /** Accessible name; leave it out when the brand name is already written next to the logo. */
  label?: string;
  /** Time each cat stays on screen, in milliseconds. */
  intervalMs?: number;
  className?: string;
}

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * The sidebar logo: the 20 sprite cats take turns in a fixed order that is shuffled once per launch. The next
 * cat rises into focus while the last one sinks away. Rotation stops while the window is hidden, and under
 * prefers-reduced-motion the logo keeps one cat instead of changing by itself.
 */
export function CatLogo({ label, intervalMs = 6000, className }: CatLogoProps) {
  const reduceMotion = useReducedMotion();
  const [order] = useState(() => shuffleCatOrder());
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }

    let timer: number | null = null;
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      stop();
      if (!document.hidden) {
        timer = window.setInterval(() => setPosition((current) => (current + 1) % CAT_SPRITE_COUNT), intervalMs);
      }
    };

    start();
    document.addEventListener('visibilitychange', start);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', start);
    };
  }, [intervalMs, reduceMotion]);

  const cat = order[position];

  return (
    <div
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-cat-logo={cat}
      className={cn(
        'relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm',
        className,
      )}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={cat}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.18, filter: 'blur(3px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.9, filter: 'blur(3px)' }}
          transition={{ duration: reduceMotion ? 0 : 0.8, ease: EASE_OUT_EXPO }}
        >
          <CatHead index={cat} className="h-full w-full" />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
