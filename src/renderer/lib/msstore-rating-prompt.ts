export const MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export interface ShouldShowRatingPromptInput {
  installDate?: string;
  now?: Date;
  /**
   * When true (local development builds), bypass the install-date check and
   * always show the prompt so the UI can be exercised without waiting a week.
   */
  isDevMode?: boolean;
}

/**
 * Pure gate for the MS Store rating prompt. Returns true when `isDevMode` is
 * set (local development), otherwise only when the persisted install date is
 * at least seven days before `now`. The prompt is shown across every
 * distribution channel; there is no opt-out state, so it stays visible
 * whenever this condition holds.
 */
export function shouldShowRatingPrompt({
  installDate,
  now = new Date(),
  isDevMode = false,
}: ShouldShowRatingPromptInput): boolean {
  if (isDevMode) {
    return true;
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
