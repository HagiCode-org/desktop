export type ServiceRegion = 'CN' | 'INTERNATIONAL';

export interface ServiceRegionState {
  region: ServiceRegion;
  isExplicit: boolean;
}

export interface SetServiceRegionResult {
  success: boolean;
  state?: ServiceRegionState;
  error?: string;
}
