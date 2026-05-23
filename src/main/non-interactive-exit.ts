import { electron } from '../electron-api.js';

const { app } = electron;

const NON_INTERACTIVE_FORCE_EXIT_DELAY_MS = 250;

export function exitNonInteractiveProcess(exitCode: number): void {
  process.exitCode = exitCode;

  // Some packaged non-interactive runs can leave Electron handles alive even
  // after the command has completed, so fall back to a forced process exit.
  const forceExitTimer = setTimeout(() => {
    process.exit(exitCode);
  }, NON_INTERACTIVE_FORCE_EXIT_DELAY_MS);
  forceExitTimer.unref?.();

  app.exit(exitCode);
}
