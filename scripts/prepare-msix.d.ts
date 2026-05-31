import type { MsixManifestConfig } from './msix-config.js';

export function renderMsixManifest(template: string, manifestConfig: MsixManifestConfig): string;
export function prepareMsixArtifacts(options: {
  arch: string;
  platform?: string;
}): Promise<void>;
