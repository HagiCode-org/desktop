import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';

/**
 * DiagnosisManager manages the diagnosis prompt file and provides
 * methods to validate and access it.
 *
 * The diagnosis prompt is a fixed file located at:
 * - Development: <project-root>/scripts/diagnosis-prompt.llm.txt
 * - Production: app.asar/scripts/diagnosis-prompt.llm.txt
 */
export class DiagnosisManager {
  /**
   * Get the path to the diagnosis prompt file
   * @returns Absolute path to diagnosis-prompt.llm.txt
   */
  getDiagnosisPromptPath(): string {
    // In production (asar), the scripts directory is in the app root
    // In development, the scripts directory is in the project root
    if (app.isPackaged) {
      // Production: app.asar/scripts/diagnosis-prompt.llm.txt
      const appRoot = path.join(process.resourcesPath || app.getAppPath(), 'scripts');
      return path.join(appRoot, 'diagnosis-prompt.llm.txt');
    } else {
      // Development: Look in the scripts directory relative to project root
      const scriptsDir = path.join(process.cwd(), 'scripts');
      return path.join(scriptsDir, 'diagnosis-prompt.llm.txt');
    }
  }

  /**
   * Check if the diagnosis prompt file exists
   * @returns true if the file exists, false otherwise
   */
  async checkPromptExists(): Promise<boolean> {
    try {
      const promptPath = this.getDiagnosisPromptPath();
      await fs.access(promptPath);
      log.info('[DiagnosisManager] Diagnosis prompt file found at:', promptPath);
      return true;
    } catch {
      log.warn('[DiagnosisManager] Diagnosis prompt file not found at:', this.getDiagnosisPromptPath());
      return false;
    }
  }

  /**
   * Read the diagnosis prompt file content
   * @returns The content of the diagnosis prompt file
   * @throws Error if the file does not exist
   */
  async readPrompt(): Promise<string> {
    const promptPath = this.getDiagnosisPromptPath();
    try {
      const content = await fs.readFile(promptPath, 'utf-8');
      log.info('[DiagnosisManager] Successfully read diagnosis prompt file');
      return content;
    } catch (error) {
      log.error('[DiagnosisManager] Failed to read diagnosis prompt file:', error);
      throw new Error(`Failed to read diagnosis prompt file: ${promptPath}`);
    }
  }

  /**
   * Validate that the diagnosis prompt file exists and is readable
   * @returns true if valid, false otherwise
   */
  async validatePrompt(): Promise<{ valid: boolean; error?: string }> {
    const exists = await this.checkPromptExists();
    if (!exists) {
      return {
        valid: false,
        error: '诊断提示词文件不存在',
      };
    }

    // Try to read the file to ensure it's readable
    try {
      await this.readPrompt();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `诊断提示词文件无法读取: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get diagnostic information for logging
   * @returns Object with diagnosis file information
   */
  async getDiagnosticInfo(): Promise<{
    exists: boolean;
    path: string;
    readable: boolean;
  }> {
    const exists = await this.checkPromptExists();
    const promptPath = this.getDiagnosisPromptPath();

    let readable = false;
    if (exists) {
      try {
        await this.readPrompt();
        readable = true;
      } catch {
        readable = false;
      }
    }

    return {
      exists,
      path: promptPath,
      readable,
    };
  }
}
