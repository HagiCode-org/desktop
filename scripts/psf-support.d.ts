export type PsfBuildConfig =
  | {
      enabled: false;
    }
  | {
      enabled: true;
      sourceDirectory: string;
      templatePath: string;
      launcherName: string;
      runtimeDllName: string;
      processLauncherDllName: string;
      fileRedirectionDllName: string;
      requiredFiles: string[];
      appExecutable: string;
      workingDirectory: string;
    };

export function resolvePsfBuildConfig(projectRoot: string, arch: string): PsfBuildConfig;
export function injectPsfIntoPackagedOutputs(projectRoot: string, input: {
  platform: string;
  arch: string;
  outputPaths: string[];
}): Promise<void>;
