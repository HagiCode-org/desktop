import { ParsedDependency, DependencyTypeName, type Manifest, type EntryPoint, type InstallResult } from './manifest-reader.js';
import Store from 'electron-store';
import log from 'electron-log';

/**
 * Dependency type enumeration
 */
export enum DependencyType {
  DotNetRuntime = 'dotnet-runtime',
  NodeJs = 'nodejs',
  JavaRuntime = 'java-runtime',
  ClaudeCode = 'claude-code',
  OpenSpec = 'openspec',
}

/**
 * Result of a dependency check
 */
export interface DependencyCheckResult {
  key: string;  // Manifest dependency key (e.g., "dotnet", "claudeCode")
  name: string;
  type: DependencyType;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  installCommand?: string | Record<string, unknown>; // Support both string and object formats
  checkCommand?: string; // Command to verify installation
  downloadUrl?: string;
  description?: string;
  isChecking?: boolean;  // True while check is in progress
}

/**
 * DependencyManager handles detection and installation of system dependencies
 * Note: Script execution has been removed. All dependency checking and installation
 * is now handled by AI.
 */
export class DependencyManager {
  private currentManifest: Manifest | null = null;

  constructor(_store?: Store<Record<string, unknown>>) {
    // Constructor kept for compatibility
  }

  /**
   * Set the current manifest for dependency operations
   * @param manifest - The manifest object
   */
  setManifest(manifest: Manifest | null): void {
    this.currentManifest = manifest;
    log.info('[DependencyManager] Manifest set:', manifest?.package.name, manifest?.package.version);
  }

  /**
   * Clear cached check results
   * Call this after installing dependencies or when forcing a refresh
   * Note: Cache mechanism has been removed, but method kept for compatibility
   */
  clearCheckCache(): void {
    log.info('[DependencyManager] Check cache cleared (cache mechanism disabled)');
  }

  /**
   * Check all dependencies from manifest
   * Note: Script execution has been removed. Returns empty array.
   * Actual dependency checking is handled by AI.
   */
  async checkAllDependencies(): Promise<DependencyCheckResult[]> {
    log.info('[DependencyManager] checkAllDependencies called (script execution disabled)');
    return [];
  }

  /**
   * Check dependencies from parsed manifest
   * Note: Script execution has been removed. All dependencies are returned as "not installed".
   * Actual dependency installation and checking is handled by AI.
   * @param dependencies - Parsed dependencies from manifest
   * @param entryPoint - EntryPoint object from manifest (kept for compatibility, not used)
   * @param onOutput - Optional callback for real-time output (not used)
   * @returns Array of dependency check results (all marked as not installed)
   */
  async checkFromManifest(
    dependencies: ParsedDependency[],
    entryPoint: EntryPoint | null,
    onOutput?: (type: 'stdout' | 'stderr', data: string, dependencyName?: string) => void
  ): Promise<DependencyCheckResult[]> {
    log.info('[DependencyManager] Checking all dependencies from manifest (script execution disabled)');

    // Return all dependencies as not installed
    // Actual dependency checking is handled by AI
    return dependencies.map(dep => ({
      key: dep.key,
      name: dep.name,
      type: this.mapDependencyType(dep.key, dep.type),
      installed: false,
      requiredVersion: this.formatRequiredVersion(dep.versionConstraints),
      description: dep.description,
      downloadUrl: dep.installHint,
    }));
  }

  /**
   * Format version constraints for display
   * @param constraints - Version constraints
   * @returns Formatted version requirement string
   */
  private formatRequiredVersion(constraints: ParsedDependency['versionConstraints']): string {
    if (constraints.exact) {
      return `exactly ${constraints.exact}`;
    }

    const parts: string[] = [];
    if (constraints.min) parts.push(`${constraints.min}+`);
    if (constraints.max) parts.push(`<= ${constraints.max}`);
    if (constraints.recommended) parts.push(`recommended: ${constraints.recommended}`);

    if (parts.length === 0) return 'any';
    return parts.join(', ');
  }

  /**
   * Map manifest dependency key and type to DependencyType enum
   * @param key - Dependency key from manifest
   * @param type - Dependency type from manifest
   * @returns Mapped DependencyType enum value
   */
  private mapDependencyType(key: string, type: DependencyTypeName): DependencyType {
    // Map based on key for known dependencies
    const keyMapping: Record<string, DependencyType> = {
      'claudeCode': DependencyType.ClaudeCode,
      'openspec': DependencyType.OpenSpec,
      'dotnet': DependencyType.DotNetRuntime,
      'node': DependencyType.NodeJs,
      'npm': DependencyType.NodeJs, // Treat npm as Node.js dependency
    };

    if (keyMapping[key]) {
      return keyMapping[key];
    }

    // Fallback based on type
    switch (type) {
      case 'npm':
        return DependencyType.ClaudeCode; // Default npm package type
      case 'system-runtime':
        if (key.includes('dotnet') || key.includes('.net')) {
          return DependencyType.DotNetRuntime;
        }
        return DependencyType.NodeJs;
      default:
        return DependencyType.ClaudeCode; // Default fallback
    }
  }

  /**
   * Install dependencies from manifest
   * Note: Script execution has been removed. All dependencies are marked as failed.
   * Actual dependency installation is handled by AI.
   * @param manifest - Parsed manifest object
   * @param dependencies - List of dependencies to install (optional, will check all if not provided)
   * @param onProgress - Progress callback
   * @returns Installation result (all marked as failed - AI will handle installation)
   */
  async installFromManifest(
    manifest: Manifest,
    dependencies?: ParsedDependency[],
    onProgress?: (progress: {
      current: number;
      total: number;
      dependency: string;
      status: 'installing' | 'success' | 'error';
    }) => void,
  ): Promise<{
    success: string[];
    failed: Array<{ dependency: string; error: string }>;
  }> {
    // Update manifest in DependencyManager
    this.setManifest(manifest);

    const results = {
      success: [] as string[],
      failed: [] as Array<{ dependency: string; error: string }>,
    };

    // If dependencies not provided, parse from manifest
    const depsToCheck = dependencies || [];

    if (depsToCheck.length === 0) {
      log.info('[DependencyManager] No dependencies to install');
      return results;
    }

    log.info('[DependencyManager] Installing dependencies from manifest (script execution disabled)');
    log.info('[DependencyManager] Dependency installation is now handled by AI');

    // Mark all dependencies as failed - AI will handle installation
    for (const dep of depsToCheck) {
      results.failed.push({
        dependency: dep.name,
        error: 'Installation now handled by AI',
      });
      onProgress?.({
        current: 1,
        total: depsToCheck.length,
        dependency: dep.name,
        status: 'error',
      });
    }

    // Clear cache after installation attempt
    this.clearCheckCache();

    return results;
  }

  /**
   * Install a single dependency
   * Note: Script execution has been removed. Actual dependency installation is handled by AI.
   * @param dep - Parsed dependency
   * @param entryPoint - EntryPoint object from manifest (kept for compatibility, not used)
   * @param onOutput - Optional callback for real-time output (not used)
   * @returns Installation result (failed - AI will handle installation)
   */
  async installSingleDependency(
    dep: ParsedDependency,
    entryPoint: EntryPoint | null,
    onOutput?: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<InstallResult> {
    log.info('[DependencyManager] Installing single dependency (script execution disabled):', dep.name);
    log.info('[DependencyManager] Dependency installation is now handled by AI');

    // Clear cache after installation attempt
    this.clearCheckCache();

    // Return failed result - AI will handle installation
    return {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: 'Installation now handled by AI',
        duration: 0,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: 'Installation now handled by AI',
      },
      parsedResult: {
        success: false,
        errorMessage: 'Installation now handled by AI',
        rawOutput: '',
      },
      installHint: dep.installHint,
    };
  }
}
