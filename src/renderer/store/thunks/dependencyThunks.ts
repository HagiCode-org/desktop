import { createAsyncThunk } from '@reduxjs/toolkit';
import { toast } from 'sonner';
import {
  fetchDependenciesStart,
  fetchDependenciesSuccess,
  fetchDependenciesFailure,
  installDependencyStart,
  installDependencySuccess,
  installDependencyFailure,
  showInstallConfirm,
  hideInstallConfirm,
  startInstall,
  updateInstallProgress,
  completeInstall,
  openInstallCommandDialog,
  closeInstallCommandDialog,
  addInstallCommandLog,
  updateInstallCommandProgress,
  setInstallCommandStatus,
  setInstallCommandVerification,
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

      // Get missing dependencies to populate the dependency list
      const missingDeps: DependencyItem[] = await window.electronAPI.getMissingDependencies(versionId);

      // Store dependencies in state for the UI to display
      dispatch(fetchDependenciesSuccess(missingDeps));

      // For onboarding context, also get ALL dependencies and store in onboardingSlice
      if (context === 'onboarding') {
        // Get ALL dependencies (including installed ones) for detailed display
        const allDeps: DependencyItem[] = await window.electronAPI.getAllDependencies(versionId);

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
 */
export const installFromManifest = createAsyncThunk(
  'dependency/installFromManifest',
  async (versionId: string, { dispatch, getState }) => {
    try {
      // Get pending dependencies and context from state
      const state = getState() as any;
      const { dependencies, context } = state.dependency.installConfirm;

      // Start installation
      dispatch(startInstall(dependencies.length));

      // Execute installation
      const result: { success: boolean; result?: { success: string[]; failed: Array<{ dependency: string; error: string }> } } =
        await window.electronAPI.installFromManifest(versionId);

      if (result.success) {
        dispatch(completeInstall({
          status: result.result?.failed && result.result.failed.length > 0 ? 'error' : 'success',
          errors: result.result?.failed,
        }));

        // Hide confirm dialog
        dispatch(hideInstallConfirm());

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
 * Replaces dependencySaga/installSingleDependency
 */
export const installSingleDependency = createAsyncThunk(
  'dependency/installSingleDependency',
  async (params: { dependencyKey: string; versionId: string; checkCommand?: string }, { dispatch }) => {
    let actualCheckCommand = params.checkCommand;

    try {
      // Start installation - open progress dialog
      dispatch(openInstallCommandDialog({
        commands: [`Installing ${params.dependencyKey}...`],
        checkCommand: actualCheckCommand,
      }));

      // Set up progress listener first, before any IPC calls
      const progressListeners: Array<(progress: any) => void> = [];
      const unsubscribe = window.electronAPI.onInstallCommandProgress((progress) => {
        console.log('[Thunk] Received progress event:', progress);
        progressListeners.forEach(listener => listener(progress));
      });

      // Process progress events
      const processProgress = (progress: any) => {
        const { type, commandIndex, output, error, checkCommand: cmdCheckCommand } = progress as {
          type: string;
          commandIndex: number;
          totalCommands: number;
          output?: string;
          error?: string;
          checkCommand?: string;
        };

        if (type === 'command-start') {
          dispatch(updateInstallCommandProgress(commandIndex));
        } else if (type === 'command-output' && output) {
          dispatch(addInstallCommandLog({
            timestamp: Date.now(),
            type: 'info',
            message: output,
          }));
        } else if (type === 'command-error' && error) {
          dispatch(addInstallCommandLog({
            timestamp: Date.now(),
            type: 'error',
            message: error,
          }));
        } else if (type === 'command-info') {
          if (cmdCheckCommand && !actualCheckCommand) {
            actualCheckCommand = cmdCheckCommand;
          }
        }
      };

      // Add listener
      progressListeners.push(processProgress);

      // Now call the IPC - progress events will be captured by the listener
      const result: { success: boolean; error?: string; checkCommand?: string } = await window.electronAPI.installSingleDependency(
        params.dependencyKey,
        params.versionId
      );

      // Update check command from response if not already set
      if (result.checkCommand && !actualCheckCommand) {
        actualCheckCommand = result.checkCommand;
      }

      // Wait a bit for all progress events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean up listener
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }

      if (!result.success) {
        dispatch(setInstallCommandStatus({
          status: 'error',
          error: result.error || '安装失败',
        }));
        dispatch(completeInstall({
          status: 'error',
          errors: [{ dependency: params.dependencyKey, error: result.error || 'Installation failed' }],
        }));

        toast.error('依赖安装失败', {
          description: result.error || `${params.dependencyKey} 安装失败`,
        });
        return { success: false };
      }

      // Installation succeeded - run verification if check command provided
      if (actualCheckCommand) {
        dispatch(setInstallCommandStatus({ status: 'verifying' }));
        dispatch(addInstallCommandLog({
          timestamp: Date.now(),
          type: 'info',
          message: '\n正在验证安装结果...',
        }));

        // Set up verification listener
        const verifyListeners: Array<(progress: any) => void> = [];
        const verifyUnsubscribe = window.electronAPI.onInstallCommandProgress((progress) => {
          verifyListeners.forEach(listener => listener(progress));
        });

        let checkOutput = '';
        const processVerifyProgress = (progress: any) => {
          const { type, output, error } = progress as {
            type: string;
            output?: string;
            error?: string;
          };

          if (type === 'command-output' && output) {
            checkOutput += output;
            dispatch(addInstallCommandLog({
              timestamp: Date.now(),
              type: 'info',
              message: output,
            }));
          } else if (type === 'command-error' && error) {
            checkOutput += error;
            dispatch(addInstallCommandLog({
              timestamp: Date.now(),
              type: 'error',
              message: error,
            }));
          }
        };

        verifyListeners.push(processVerifyProgress);

        // Execute check command
        await window.electronAPI.executeInstallCommands([actualCheckCommand], undefined);

        // Wait for verification to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Clean up listener
        if (typeof verifyUnsubscribe === 'function') {
          verifyUnsubscribe();
        }

        // Parse verification result from collected output
        const versionMatch = checkOutput.match(/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/);
        const installedVersion = versionMatch ? versionMatch[1] : null;

        if (installedVersion) {
          dispatch(addInstallCommandLog({
            timestamp: Date.now(),
            type: 'success',
            message: `\n✓ 验证成功！已安装版本: ${installedVersion}`,
          }));
          dispatch(setInstallCommandVerification(true));
        } else {
          dispatch(addInstallCommandLog({
            timestamp: Date.now(),
            type: 'warning',
            message: '\n⚠ 无法验证安装版本，请手动确认',
          }));
          dispatch(setInstallCommandVerification(false));
        }

        dispatch(setInstallCommandStatus({ status: 'success' }));
      } else {
        dispatch(setInstallCommandStatus({ status: 'success' }));
      }

      dispatch(completeInstall({
        status: 'success',
        errors: [],
      }));

      toast.success('依赖安装成功', {
        description: `${params.dependencyKey} 已成功安装，关闭对话框后将刷新依赖列表`,
      });

      return { success: true };

    } catch (error) {
      dispatch(setInstallCommandStatus({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }));
      dispatch(completeInstall({
        status: 'error',
        errors: [{ dependency: params.dependencyKey, error: error instanceof Error ? error.message : '未知错误' }],
      }));

      console.error('Failed to install single dependency:', error);

      toast.error('依赖安装失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });

      throw error;
    }
  }
);

/**
 * Execute install commands with progress
 * Replaces dependencySaga/executeInstallCommands
 */
export const executeInstallCommands = createAsyncThunk(
  'dependency/executeInstallCommands',
  async (params: { commands: string[]; workingDirectory?: string }, { dispatch }) => {
    const { commands, workingDirectory } = params;

    try {
      // Open dialog
      dispatch(openInstallCommandDialog({ commands }));

      // Set up progress listener
      const progressListeners: Array<(progress: any) => void> = [];
      const unsubscribe = window.electronAPI.onInstallCommandProgress((progress) => {
        progressListeners.forEach(listener => listener(progress));
      });

      const processProgress = (progress: any) => {
        const { type, commandIndex, output, error } = progress as {
          type: string;
          commandIndex: number;
          totalCommands: number;
          output?: string;
          error?: string;
        };

        if (type === 'command-start') {
          dispatch(updateInstallCommandProgress(commandIndex));
        } else if (type === 'command-output' && output) {
          dispatch(addInstallCommandLog({
            timestamp: Date.now(),
            type: 'info',
            message: output,
          }));
        } else if (type === 'command-error' && error) {
          dispatch(addInstallCommandLog({
            timestamp: Date.now(),
            type: 'error',
            message: error,
          }));
        }
      };

      progressListeners.push(processProgress);

      // Execute commands
      const result: { success: boolean; error?: string } = await window.electronAPI.executeInstallCommands(
        commands,
        workingDirectory
      );

      // Wait for all progress events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean up listener
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }

      if (result.success) {
        dispatch(setInstallCommandStatus({ status: 'success' }));
        toast.success('命令执行成功', {
          description: '所有命令已成功执行',
        });
      } else {
        dispatch(setInstallCommandStatus({
          status: 'error',
          error: result.error || '命令执行失败',
        }));
        toast.error('命令执行失败', {
          description: result.error || '执行过程中出现错误',
        });
      }

      return result.success;
    } catch (error) {
      dispatch(setInstallCommandStatus({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }));

      toast.error('命令执行失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });

      console.error('Failed to execute install commands:', error);
      throw error;
    }
  }
);

/**
 * Initialize dependency on app startup
 * Replaces dependencySaga/initializeDependencySaga
 */
export const initializeDependency = fetchDependencies;
