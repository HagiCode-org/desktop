import { createAsyncThunk } from '@reduxjs/toolkit';
import { toast } from 'sonner';
import {
  fetchDependenciesStart,
  fetchDependenciesSuccess,
  fetchDependenciesFailure,
  installDependencyStart,
  installDependencySuccess,
  installDependencyFailure,
  startInstall,
  updateInstallProgress,
  completeInstall,
  DependencyType,
  type DependencyItem,
} from '../slices/dependencySlice';
import { setDependencyCheckResults } from '../slices/onboardingSlice';

declare global {
  interface Window {
    electronAPI: {
      checkDependencies: () => Promise<DependencyItem[]>;
      getMissingDependencies: (versionId: string) => Promise<DependencyItem[]>;
      getAllDependencies: (versionId: string) => Promise<DependencyItem[]>;
      getDependencyList: (versionId: string) => Promise<DependencyItem[]>;
    };
  }
}

/**
 * Fetch dependencies status
 * Replaces dependencySaga/fetchDependenciesStatus
 */
export const fetchDependencies = createAsyncThunk(
  'dependency/fetchDependencies',
  async (_, { dispatch }) => {
    try {
      dispatch(fetchDependenciesStart());

      const dependencies: DependencyItem[] = await window.electronAPI.checkDependencies();

      dispatch(fetchDependenciesSuccess(dependencies));
      return dependencies;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dependencies';
      dispatch(fetchDependenciesFailure(errorMessage));
      throw error;
    }
  }
);

/**
 * Install dependency
 * Replaces dependencySaga/installDependency
 */
export const installDependency = createAsyncThunk(
  'dependency/installDependency',
  async (dependencyType: DependencyType, { dispatch }) => {
    try {
      dispatch(installDependencyStart(dependencyType));

      const success: boolean = await window.electronAPI.installDependency(dependencyType);

      if (success) {
        dispatch(installDependencySuccess());
        // Refresh dependencies after installation
        await dispatch(fetchDependencies());
      } else {
        dispatch(installDependencyFailure('Installation failed'));
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to install dependency';
      dispatch(installDependencyFailure(errorMessage));
      throw error;
    }
  }
);

/**
 * Check dependencies after package installation
 * Replaces dependencySaga/checkDependenciesAfterInstall
 */
export const checkDependenciesAfterInstall = createAsyncThunk(
  'dependency/checkAfterInstall',
  async (params: { versionId: string; context?: 'version-management' | 'onboarding' }, { dispatch }) => {
    try {
      const { versionId, context = 'version-management' } = params;
      console.log('[checkDependenciesAfterInstall] Starting with versionId:', versionId, 'context:', context);

      // Step 1: Quickly get dependency list from manifest (shows "checking" state)
      if (context === 'onboarding') {
        console.log('[checkDependenciesAfterInstall] Getting dependency list...');
        const depList = await window.electronAPI.getDependencyList(versionId);
        console.log('[checkDependenciesAfterInstall] Got dependency list:', depList.length, 'items');

        // Store initial list with "checking" state
        dispatch(setDependencyCheckResults(depList.map(dep => ({
          key: dep.key,
          name: dep.name,
          type: dep.type,
          installed: false, // Unknown at this point
          isChecking: true, // Show checking state
          version: undefined,
          requiredVersion: dep.requiredVersion,
          versionMismatch: false,
          description: dep.description,
        }))));
      }

      // Step 2: Execute actual dependency check (this takes time)
      // Get missing dependencies to populate the dependency list
      console.log('[checkDependenciesAfterInstall] Getting missing dependencies...');
      const missingDeps: DependencyItem[] = await window.electronAPI.getMissingDependencies(versionId);
      console.log('[checkDependenciesAfterInstall] Got missing deps:', missingDeps.length, 'items');

      // Store dependencies in state for the UI to display
      dispatch(fetchDependenciesSuccess(missingDeps));

      // For onboarding context, also get ALL dependencies and store in onboardingSlice
      if (context === 'onboarding') {
        // Get ALL dependencies (including installed ones) for detailed display
        console.log('[checkDependenciesAfterInstall] Getting all dependencies...');
        const allDeps: DependencyItem[] = await window.electronAPI.getAllDependencies(versionId);
        console.log('[checkDependenciesAfterInstall] Got all deps:', allDeps.length, 'items');

        // Store the results in onboarding state for detailed display
        dispatch(setDependencyCheckResults(allDeps.map(dep => ({
          key: dep.key,
          name: dep.name,
          type: dep.type,
          installed: dep.installed,
          version: dep.version,
          requiredVersion: dep.requiredVersion,
          versionMismatch: dep.versionMismatch,
          description: dep.description,
          isChecking: false, // Check complete
        }))));
      }

      // Don't show confirmation dialog - the UI now has direct install buttons
      // Just store the dependencies in state for the UI to display
      if (missingDeps.length > 0 && context === 'onboarding') {
        // For onboarding, we already display dependencies with install buttons
        // No need to show a separate confirmation dialog
      }

      return missingDeps;
    } catch (error) {
      console.error('Failed to check dependencies after install:', error);
      throw error;
    }
  }
);

/**
 * Install dependencies from manifest
 * Replaces dependencySaga/installFromManifest
 * Now accepts dependencies as parameter instead of reading from state
 */
export const installFromManifest = createAsyncThunk(
  'dependency/installFromManifest',
  async (params: { versionId: string; dependencies?: DependencyItem[]; context?: 'version-management' | 'onboarding' }, { dispatch }) => {
    const { versionId, dependencies, context = 'version-management' } = params;

    try {
      // Get dependencies from parameter or fetch from API
      let depsToInstall = dependencies;
      if (!depsToInstall) {
        // Fallback: fetch missing dependencies if not provided
        depsToInstall = await window.electronAPI.getMissingDependencies(versionId);
      }

      // Start installation
      dispatch(startInstall(depsToInstall.length));

      // Execute installation
      const result: { success: boolean; result?: { success: string[]; failed: Array<{ dependency: string; error: string }> } } =
        await window.electronAPI.installFromManifest(versionId);

      if (result.success) {
        dispatch(completeInstall({
          status: result.result?.failed && result.result.failed.length > 0 ? 'error' : 'success',
          errors: result.result?.failed,
        }));

        // Refresh dependencies
        await dispatch(fetchDependencies());

        // Show result toast notification
        if (result.result?.failed && result.result.failed.length > 0) {
          const failed = result.result.failed.length;
          const success = result.result.success.length;

          if (success > 0) {
            toast.success('依赖安装完成', {
              description: `${success} 个依赖安装成功，${failed} 个失败`,
            });
          } else {
            toast.error('依赖安装失败', {
              description: `${failed} 个依赖安装失败`,
            });
          }
        } else {
          toast.success('依赖安装成功', {
            description: '所有依赖已成功安装',
          });
        }

        // Trigger onboarding next step if in onboarding context and all dependencies installed successfully
        if (context === 'onboarding' && (!result.result?.failed || result.result.failed.length === 0)) {
          dispatch({ type: 'dependency/triggerOnboardingNext' });
        }
      } else {
        dispatch(completeInstall({
          status: 'error',
          errors: [{ dependency: 'unknown', error: 'Installation failed' }],
        }));

        toast.error('依赖安装失败', {
          description: '安装过程中出现错误',
        });
      }

      return result.success;
    } catch (error) {
      dispatch(completeInstall({
        status: 'error',
        errors: [{ dependency: 'unknown', error: error instanceof Error ? error.message : String(error) }],
      }));

      toast.error('依赖安装失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });

      console.error('Failed to install from manifest:', error);
      throw error;
    }
  }
);

/**
 * Install single dependency
 * Simplified version - directly calls IPC without progress dialog
 */
export const installSingleDependency = createAsyncThunk(
  'dependency/installSingleDependency',
  async (params: { dependencyKey: string; versionId: string }, { dispatch }) => {
    try {
      // Directly call IPC without progress dialog
      const result: { success: boolean; error?: string } = await window.electronAPI.installSingleDependency(
        params.dependencyKey,
        params.versionId
      );

      if (!result.success) {
        toast.error('依赖安装失败', {
          description: result.error || `${params.dependencyKey} 安装失败`,
        });
        return { success: false };
      }

      toast.success('依赖安装成功', {
        description: `${params.dependencyKey} 已成功安装`,
      });

      return { success: true };

    } catch (error) {
      console.error('Failed to install single dependency:', error);

      toast.error('依赖安装失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });

      throw error;
    }
  }
);

/**
 * Initialize dependency on app startup
 * Replaces dependencySaga/initializeDependencySaga
 */
export const initializeDependency = fetchDependencies;
