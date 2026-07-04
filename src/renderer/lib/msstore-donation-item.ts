export const MSSTORE_DONATION_ITEM_DAY_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

export interface ShouldShowMsstoreDonationItemInput {
  isWinStoreRuntime: boolean;
  installDate?: string;
  dismissedAt?: string;
  now?: Date;
}

export function shouldShowMsstoreDonationItem({
  isWinStoreRuntime,
  installDate,
  dismissedAt,
  now = new Date(),
}: ShouldShowMsstoreDonationItemInput): boolean {
  if (!isWinStoreRuntime) {
    return false;
  }

  if (dismissedAt && dismissedAt.trim().length > 0) {
    return false;
  }

  if (!installDate || installDate.trim().length === 0) {
    return false;
  }

  const installTime = Date.parse(installDate);
  if (Number.isNaN(installTime)) {
    return false;
  }

  return now.getTime() - installTime >= MSSTORE_DONATION_ITEM_DAY_THRESHOLD_MS;
}
