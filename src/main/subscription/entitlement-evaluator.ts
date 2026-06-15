import {
  subscriptionEntitlementNames,
  type SubscriptionEntitlementName,
  type SubscriptionSnapshot,
} from '../../types/subscription.js';
import { StoreLicenseEntitlementEvaluator } from './store-license-entitlement-evaluator.js';

export class EntitlementEvaluator extends StoreLicenseEntitlementEvaluator<
  SubscriptionSnapshot,
  SubscriptionEntitlementName
> {
  constructor() {
    super(subscriptionEntitlementNames);
  }
}
