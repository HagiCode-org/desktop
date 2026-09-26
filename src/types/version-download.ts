export type VersionAssetKind = 'desktop-package' | 'desktop-latest' | 'web-package' | 'web-latest' | 'generic';

export type VersionDownloadMode = 'http-direct' | 'source-fallback';

export type DownloadSourceKind = 'official' | 'github-release' | 'cloudflare';

export interface DownloadSource {
  kind: DownloadSourceKind;
  label: string;
  url: string;
  urls?: { china?: string; international?: string };
  primary: boolean;
}

export type VersionDownloadMessage =
  | 'direct-http'
  | 'source-fallback-active'
  | 'no-sha256-required'
  | 'sha256-verifying'
  | 'sha256-verified'
  | 'extracting-package'
  | 'switching-active-version'
  | 'installation-complete';

export type VersionInstallStage =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'switching'
  | 'completed'
  | 'error';

export interface VersionDownloadProgress {
  current: number;
  total: number;
  percentage: number;
  stage: VersionInstallStage;
  mode: VersionDownloadMode;
  message?: VersionDownloadMessage | string;
  verified?: boolean;
}
