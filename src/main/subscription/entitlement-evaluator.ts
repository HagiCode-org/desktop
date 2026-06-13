import {
  subscriptionEntitlementNames,
  type SubscriptionEntitlementName,
  type SubscriptionSnapshot,
} from '../../types/subscription.js';

export class EntitlementEvaluator {
  evaluate(snapshot: SubscriptionSnapshot): SubscriptionEntitlementName[] {
    if (snapshot.availability !== 'supported' || snapshot.status !== 'active') {
      return [];
    }

    return [...subscriptionEntitlementNames];
  }
}
