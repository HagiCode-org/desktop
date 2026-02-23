import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import log from 'electron-log';
import type { ResultSessionFile } from '../manifest-reader.js';

/**
 * Standard PowerShell arguments for script execution
 * These arguments ensure consistent behavior across all PowerShell invocations
 * -NoProfile: Faster startup, no user profile loading
 * -ExecutionPolicy Bypass: Allow script execution regardless of system policy
 * -WindowStyle Hidden: Critical for no-flicker requirement on Windows
 * -File: Specify the script file to execute
 */
export const POWERSHELL_ARGS = [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-WindowStyle',
  'Hidden',
  '-File',
];

/**
 * Options for PowerShell script execution
 */
export interface PowerShellExecutorOptions {
  /**
   * Working directory for script execution
   */
  cwd?: string;
  /**
   * Additional arguments to pass to the script
   */
  scriptArgs?: string[];
  /**
   * Environment variables to pass to the script
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Timeout in milliseconds (default: 300000 = 5 minutes)
   */
  timeout?: number;
  /**
   * Optional callback for real-time output
   */
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void;
}

/**
 * Result from PowerShell script execution
 */
export interface PowerShellExecutionResult {
  /**
   * Exit code from the script
   */
  exitCode: number;
  /**
   * Standard output captured
   */
  stdout: string;
  /**
   * Standard error captured
   */
  stderr: string;
  /**
   * Whether the execution was successful (exit code 0)
   */
  success: boolean;
  /**
   * Error message if execution failed
   */
  errorMessage?: string;
}

/**
 * PowerShellExecutor handles direct invocation of PowerShell scripts
 *
 * This class provides a clean interface for executing PowerShell scripts on Windows
 * without using .bat wrapper layers. Direct invocation eliminates console window flicker
 * by applying windowsHide directly to the PowerShell.exe process.
 *
 * Key benefits:
 * - No cmd.exe intermediate layer
 * - windowsHide applies directly to PowerShell.exe
 * - Better control over PowerShell execution parameters
 * - Consistent spawn configuration for all Windows scripts
 *
 * @example
 * ```typescript
 * const executor = new PowerShellExecutor();
 * const result = await executor.execute('/path/to/script.ps1', {
 *   cwd: '/working/directory',
 *   onOutput: (type, data) => console.log(type, data)
 * });
 * ```
 */
export class PowerShellExecutor {
  /**
   * Execute a PowerShell script directly
   *
   * This method spawns PowerShell.exe with the standard arguments and waits for
   * the script to complete. It captures stdout/stderr and handles timeouts.
   *
   * @param scriptPath - Full path to the .ps1 script file
   * @param options - Execution options
   * @returns Promise resolving to execution result
   */
  async execute(scriptPath: string, options: PowerShellExecutorOptions = {}): Promise<PowerShellExecutionResult> {
    const {
      cwd,
      scriptArgs = [],
      env,
      timeout = 300000,
      onOutput,
    } = options;

    log.info('[PowerShellExecutor] Executing script:', scriptPath);
    log.info('[PowerShellExecutor] Working directory:', cwd);
    log.info('[PowerShellExecutor] Script args:', scriptArgs.join(' '));

    // Build PowerShell command arguments
    // Standard args: -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File <script-path>
    const args = [...POWERSHELL_ARGS, scriptPath, ...scriptArgs];

    // Spawn options for PowerShell
    // shell: false - PowerShell.exe is executable, no shell needed
    // windowsHide: true - Hide console window to prevent flicker
    // detached: false - Keep process attached for proper lifecycle management
    const spawnOptions: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      shell: boolean;
      windowsHide?: boolean;
      stdio: Array<'pipe' | 'ignore' | 'inherit'>;
    } = {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    // Windows-specific option to hide console window
    if (process.platform === 'win32') {
      spawnOptions.windowsHide = true;
    }

    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', args, spawnOptions);

      let timeoutHandle: NodeJS.Timeout | null = null;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let isResolved = false;

      // Set timeout
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          if (isResolved) return;
          isResolved = true;

          log.warn(`[PowerShellExecutor] Script execution timeout after ${timeout}ms:`, scriptPath);
          child.kill('SIGKILL');

          resolve({
            exitCode: -1,
            stdout: stdoutBuffer,
            stderr: stderrBuffer,
            success: false,
            errorMessage: `Script execution timeout after ${timeout}ms`,
          });
        }, timeout);
      }

      // Capture stdout
      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;

        log.info('[PowerShellExecutor] STDOUT:', chunk.trim());
        onOutput?.('stdout', chunk);
      });

      // Capture stderr
      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrBuffer += chunk;

        log.error('[PowerShellExecutor] STDERR:', chunk.trim());
        onOutput?.('stderr', chunk);
      });

      // Handle process exit
      child.on('exit', (code) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (isResolved) return;
        isResolved = true;

        const exitCode = code ?? -1;
        log.info('[PowerShellExecutor] Script exited with code:', exitCode);

        resolve({
          exitCode,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          success: exitCode === 0,
          errorMessage: exitCode !== 0 ? `Script exited with code ${exitCode}` : undefined,
        });
      });

      // Handle process spawn errors
      child.on('error', (error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (isResolved) return;
        isResolved = true;

        log.error('[PowerShellExecutor] Process spawn error:', error.message);

        // Provide specific error messages for common issues
        let errorMessage = error.message;
        if (error.message.includes('ENOENT')) {
          errorMessage = 'PowerShell.exe not found. Please ensure PowerShell is installed and in PATH.';
        } else if (error.message.includes('EACCES')) {
          errorMessage = `Permission denied accessing script: ${scriptPath}`;
        }

        resolve({
          exitCode: -1,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          success: false,
          errorMessage,
        });
      });
    });
  }

  /**
   * Execute a PowerShell script and read the result.json file
   *
   * This is a convenience method that executes a script and then reads the
   * result.json file from the script directory. This is the standard pattern
   * used in Hagicode Desktop for dependency check, install, and start scripts.
   *
   * @param scriptPath - Full path to the .ps1 script file
   * @param scriptDirectory - Directory where result.json will be written
   * @param options - Execution options
   * @returns Promise resolving to ResultSessionFile or null if not found
   */
  async executeAndReadResult(
    scriptPath: string,
    scriptDirectory: string,
    options: PowerShellExecutorOptions = {}
  ): Promise<ResultSessionFile> {
    log.info('[PowerShellExecutor] Executing script with result reading:', scriptPath);

    // Execute the script
    const result = await this.execute(scriptPath, options);

    // Wait a bit for result.json to be written
    await new Promise(resolve => setTimeout(resolve, 500));

    // Try to read result.json
    try {
      const resultPath = `${scriptDirectory}/result.json`;
      const content = await fs.readFile(resultPath, 'utf-8');
      const resultData = JSON.parse(content) as ResultSessionFile;

      log.info('[PowerShellExecutor] Result file read successfully:', resultPath);
      return resultData;
    } catch (error) {
      log.warn('[PowerShellExecutor] result.json not found or invalid, using execution result:', error);

      // Fallback: create result from execution output
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: 0,
        timestamp: new Date().toISOString(),
        success: result.success,
        errorMessage: result.errorMessage,
      };
    }
  }

  /**
   * Check if the current platform supports this executor
   * @returns true if running on Windows
   */
  isSupported(): boolean {
    return process.platform === 'win32';
  }
}

/**
 * Singleton instance for easy access
 */
export const powerShellExecutor = new PowerShellExecutor();
