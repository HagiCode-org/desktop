import type { StoreLicensePurchaseOutcome } from './store-license.js';

export interface MsstoreDonationItemState {
  purchaseCount: number;
  dismissedAt?: string;
}

export interface MsstoreDonationItemPurchaseResult {
  outcome: StoreLicensePurchaseOutcome;
  purchaseCount: number;
}

export interface MsstoreDonationItemBridge {
  getState: () => Promise<MsstoreDonationItemState>;
  dismiss: () => Promise<MsstoreDonationItemState>;
  purchase: () => Promise<MsstoreDonationItemPurchaseResult>;
  onDidChange: (callback: (state: MsstoreDonationItemState) => void) => () => void;
}

export const msstoreDonationItemChannels = {
  getState: 'get-msstore-donation-item-state',
  dismiss: 'dismiss-msstore-donation-item',
  purchase: 'purchase-msstore-donation-item',
  changed: 'msstore-donation-item:changed',
} as const;
