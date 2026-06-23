export const MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export interface ShouldShowRatingPromptInput {
  isWindowsStoreRuntime: boolean;
  installDate?: string;
  now?: Date;
}

/**
 * Pure gate for the MS Store rating prompt. Returns true only when the app is
 * running in the Windows Store distribution channel AND the persisted install
 * date is at least seven days before `now`. There is no opt-out state: the
 * prompt stays visible whenever these conditions hold.
 */
export function shouldShowRatingPrompt({
  isWindowsStoreRuntime,
  installDate,
  now = new Date(),
}: ShouldShowRatingPromptInput): boolean {
  if (!isWindowsStoreRuntime) {
    return false;
  }

  if (!installDate || installDate.trim().length === 0) {
    return false;
  }

  const installTime = Date.parse(installDate);
  if (Number.isNaN(installTime)) {
    return false;
  }

  const currentTime = now.getTime();
  return currentTime - installTime >= MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS;
}
