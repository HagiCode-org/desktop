export interface DesktopVersionInfoPayload {
  desktopVersion: string;
  windowsStoreVersion: string | null;
  buildBranch: string;
  buildCommit: string;
}
