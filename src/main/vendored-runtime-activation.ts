import type { DependencyManagementService } from './dependency-management-service.js';
import { PathManager } from './path-manager.js';
import { clearVendoredRuntimeActivationProgress } from './vendored-runtime-activation-state.js';
import type {
  VendoredRuntimeActivationProgress,
  VendoredRuntimeId,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

export interface VendoredRuntimeActivationResult {
  success: boolean;
  status: VendoredRuntimeStatusSnapshot;
  error?: string;
}

function isActivationTerminal(stage: VendoredRuntimeActivationProgress['stage']): boolean {
  return stage === 'completed' || stage === 'failed';
}

export class VendoredRuntimeActivationService {
  private static instance: VendoredRuntimeActivationService | null = null;

  static getInstance(
    pathManager: PathManager = PathManager.getInstance(),
    dependencyManagementService?: DependencyManagementService,
  ): VendoredRuntimeActivationService {
    if (!VendoredRuntimeActivationService.instance) {
      VendoredRuntimeActivationService.instance =
        new VendoredRuntimeActivationService(pathManager, dependencyManagementService);
    }
    return VendoredRuntimeActivationService.instance;
  }

  constructor(
    _pathManager: PathManager = PathManager.getInstance(),
    _dependencyManagementService?: DependencyManagementService,
  ) {}

  async activate(runtimeId: VendoredRuntimeId): Promise<VendoredRuntimeActivationResult> {
    throw new Error(`Unsupported vendored runtime: ${runtimeId}`);
  }
}

export function getVendoredRuntimeActivationService(
  pathManager: PathManager = PathManager.getInstance(),
  dependencyManagementService?: DependencyManagementService,
): VendoredRuntimeActivationService {
  return VendoredRuntimeActivationService.getInstance(pathManager, dependencyManagementService);
}

export function isVendoredRuntimeActivationInFlight(
  progress: VendoredRuntimeActivationProgress | null | undefined,
): boolean {
  return Boolean(progress && !isActivationTerminal(progress.stage));
}

export function clearCompletedVendoredRuntimeActivation(
  runtimeId: VendoredRuntimeId,
  progress: VendoredRuntimeActivationProgress | null | undefined,
): void {
  if (progress && isActivationTerminal(progress.stage)) {
    clearVendoredRuntimeActivationProgress(runtimeId);
  }
}
