import { useEffect } from 'react';
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { CatHead } from '@/components/ui/cat-head';
import { CAT_SPRITE_COUNT } from '@/lib/cat-sprite';
import { getStartupProgressIndex, getStartupProgressRange } from '@/lib/startup-progress-track';
import { getStartupProgressSteps, resolveDisplayedStartupPhase } from '@/lib/webServiceStartupProgress';
import type { ProcessStatus, StartupPhase } from '../store/slices/webServiceSlice';

/** Cat tile edge, and the button's horizontal padding the lane starts after (px-3), in px. */
const CAT_SIZE = 44;
const LANE_INSET = 12;
/** One tick per phase boundary the cat crosses: starts of phases 2 to 5 on a 0-1 track. */
const PHASE_TICKS = [1, 2, 3, 4].map((boundary) => boundary / 5);

const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

interface StartupProgressTrackProps {
  status: Extract<ProcessStatus, 'starting' | 'stopping'>;
  phase: StartupPhase;
  /** Shuffled sprite cells; step N of the startup is run by `cats[N]`. */
  cats: readonly number[];
}

/**
 * The start button while the service is starting or stopping: the button becomes a track. A bright fill
 * advances along a pale bed (the theme's own colours, so the label keeps its contrast in light and dark) and a cat rides its leading edge. The cat lands on a tick, hops and is replaced by
 * a new one at every startup phase; between phases the track creeps, but never past the next tick, so only a
 * real phase change moves it across a boundary. While stopping, the track unwinds back to the start.
 *
 * It fills its (relatively positioned, clipped) parent. Position is state, so it still moves under
 * prefers-reduced-motion; only the creep, hop, bob and shimmer are dropped.
 */
export default function StartupProgressTrack({ status, phase, cats }: StartupProgressTrackProps) {
  const { t } = useTranslation('components');
  const reduceMotion = useReducedMotion();
  const isStopping = status === 'stopping';
  const displayedPhase = resolveDisplayedStartupPhase(status, phase);
  const stepIndex = getStartupProgressIndex(displayedPhase);
  const steps = getStartupProgressSteps(t);
  const progress = useMotionValue(isStopping ? 1 : 0);

  useEffect(() => {
    if (isStopping) {
      progress.set(1);
      const unwind = animate(progress, 0, { duration: reduceMotion ? 0 : 1.6, ease: EASE_IN_OUT });
      return () => unwind.stop();
    }

    const { from, to } = getStartupProgressRange(displayedPhase);
    if (reduceMotion) {
      progress.set(from);
      return undefined;
    }

    let cancelled = false;
    let creep: ReturnType<typeof animate> | undefined;
    const land = animate(progress, from, { type: 'spring', stiffness: 150, damping: 20 });
    void land.then(() => {
      if (!cancelled) {
        creep = animate(progress, to, { duration: 30, ease: [0.1, 0.7, 0.3, 1] });
      }
    });

    return () => {
      cancelled = true;
      land.stop();
      creep?.stop();
    };
  }, [displayedPhase, isStopping, progress, reduceMotion]);

  const runnerLeft = useMotionTemplate`calc(${progress} * (100% - ${CAT_SIZE}px))`;
  const fillWidth = useMotionTemplate`calc(${progress} * (100% - ${CAT_SIZE}px) + ${CAT_SIZE / 2 + LANE_INSET}px)`;
  const cat = cats[stepIndex % CAT_SPRITE_COUNT] ?? 0;

  return (
    <>
      <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--primary)_20%,var(--background))]" />

      <div className="relative flex h-full items-center gap-3 px-3 text-foreground">
        <div className="relative h-full min-w-0 flex-1">
          <motion.div
            className="absolute inset-y-0 -left-3 overflow-hidden bg-linear-to-r from-primary via-primary to-[color-mix(in_oklab,var(--primary),white_24%)]"
            style={{ width: fillWidth }}
          >
            {reduceMotion ? null : (
              <motion.div
                className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }}
              />
            )}
          </motion.div>

          <div aria-hidden className="absolute inset-x-0 bottom-[10px] h-0.5 rounded-full bg-foreground/15" />
          {PHASE_TICKS.map((tick, index) => (
            <span
              key={tick}
              aria-hidden
              className={`absolute bottom-[7px] h-2 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-300 ${
                stepIndex > index ? 'bg-primary-foreground' : 'bg-foreground/35'
              }`}
              style={{ left: `calc(${tick} * (100% - ${CAT_SIZE}px) + ${CAT_SIZE / 2}px)` }}
            />
          ))}

          <motion.div className="absolute inset-y-0 flex items-center" style={{ left: runnerLeft }}>
            <motion.div
              key={stepIndex}
              className="origin-bottom"
              initial={reduceMotion ? false : { y: 0, scaleX: 1, scaleY: 1 }}
              animate={reduceMotion ? undefined : { y: [0, -14, 0], scaleX: [1, 0.94, 1.1, 1], scaleY: [1, 1.08, 0.84, 1] }}
              transition={{
                y: { duration: 0.6, times: [0, 0.45, 1], ease: ['easeOut', 'easeIn'] },
                scaleX: { duration: 0.6, times: [0, 0.45, 0.78, 1], ease: 'easeOut' },
                scaleY: { duration: 0.6, times: [0, 0.45, 0.78, 1], ease: 'easeOut' },
              }}
            >
              <motion.div
                animate={reduceMotion || isStopping ? undefined : { y: [0, -1.5, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              >
                <motion.div
                  initial={reduceMotion ? false : { scale: 0.6, rotate: -14 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 16 }}
                >
                  <CatHead
                    index={cat}
                    className="h-11 w-11 rounded-xl ring-2 ring-background shadow-[0_4px_10px_rgb(0_0_0/0.3)]"
                  />
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>

        <div className="max-w-[46%] shrink-0 pr-2 text-left leading-tight">
          <div className="truncate text-base font-semibold">
            {t(isStopping ? 'webServiceStatus.status.stopping' : 'webServiceStatus.status.starting')}
          </div>
          {isStopping ? null : (
            <div className="truncate text-xs tabular-nums text-foreground/75">
              {steps[stepIndex]?.label} · {stepIndex + 1}/{steps.length - 1}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
