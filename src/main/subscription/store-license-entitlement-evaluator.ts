import type { StoreLicenseSnapshot } from '../../types/store-license.js';

export class StoreLicenseEntitlementEvaluator<
  TSnapshot extends StoreLicenseSnapshot<TEntitlement>,
  TEntitlement extends string,
> {
  constructor(private readonly activeEntitlements: readonly TEntitlement[]) {}

  evaluate(snapshot: TSnapshot): TEntitlement[] {
    if (snapshot.availability !== 'supported' || snapshot.status !== 'active') {
      return [];
    }

    return [...this.activeEntitlements];
  }
}
