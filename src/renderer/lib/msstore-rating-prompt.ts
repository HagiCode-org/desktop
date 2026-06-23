export const MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export interface ShouldShowRatingPromptInput {
  installDate?: string;
  now?: Date;
}

/**
 * Pure gate for the MS Store rating prompt. Returns true only when the persisted
 * install date is at least seven days before `now`. The prompt is shown across
 * every distribution channel; there is no opt-out state, so it stays visible
 * whenever this condition holds.
 */
export function shouldShowRatingPrompt({
  installDate,
  now = new Date(),
}: ShouldShowRatingPromptInput): boolean {
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
