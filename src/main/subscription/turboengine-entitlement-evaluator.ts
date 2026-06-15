import {
  turboEngineEntitlementNames,
  type TurboEngineEntitlementName,
  type TurboEngineLicenseSnapshot,
} from '../../types/turboengine-license.js';
import { StoreLicenseEntitlementEvaluator } from './store-license-entitlement-evaluator.js';

export class TurboEngineEntitlementEvaluator extends StoreLicenseEntitlementEvaluator<
  TurboEngineLicenseSnapshot,
  TurboEngineEntitlementName
> {
  constructor() {
    super(turboEngineEntitlementNames);
  }
}
