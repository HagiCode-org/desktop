export interface RenderMsixManifestOptions {
  identityName: string;
  publisher: string;
  version: string;
  arch: string;
  displayName: string;
  publisherDisplayName: string;
  description: string;
  executable: string;
  applicationId: string;
  backgroundColor: string;
  languages: string[];
  capabilities: string[];
  minVersion: string;
  maxVersionTested: string;
}

export interface PackageMsixOptions {
  input?: string;
  output?: string;
  stage?: string;
  assets?: string;
  verbose?: boolean;
}

export interface PackageMsixResult {
  artifactPath: string;
  executable: string;
  manifestPath: string;
  stageAppDir: string;
}

export function toWindowsPackageVersion(version: string): string;
export function resolveProducedMsixFileName(options: { desiredFileName: string; packageVersion: string; arch: string; fileNames: string[]; }): string | null;
export function renderMsixManifest(options: RenderMsixManifestOptions): string;
export function packageMsix(options?: PackageMsixOptions): Promise<PackageMsixResult>;
