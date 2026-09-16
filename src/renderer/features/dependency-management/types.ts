import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { DependencyManagementSnapshot, ManagedNpmPackageId, ManagedNpmPackageStatusSnapshot } from '../../../types/dependency-management.js';

export type DependencyManagementTabId = 'cliPackages' | 'environment';

export interface DependencyManagementTabProps {
  snapshot: DependencyManagementSnapshot;
  basePackages: ManagedNpmPackageStatusSnapshot[];
  agentCliPackages: ManagedNpmPackageStatusSnapshot[];
  baseHighlightedPackageIds: string[];
  agentCliHighlightedPackageIds: string[];
  selectedPackageIds: Set<ManagedNpmPackageId>;
  onSelectionChange: (ids: string[], group: 'base' | 'agent-cli') => void;
  onGenerateBatchCommand: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenNodeEnvironmentFaq: () => void;
  onUpdateMirrorSettings: (enabled: boolean) => void;
  isSavingMirrorSettings: boolean;
  mirrorRegistryUrl: string;
  mirrorSaveError: string | null;
}

export type DependencyManagementTabLoader = () => Promise<{ default: ComponentType<DependencyManagementTabProps> }>;

export interface DependencyManagementTabConfig {
  id: DependencyManagementTabId;
  labelKey: string;
  icon: LucideIcon;
  loader: DependencyManagementTabLoader;
}
