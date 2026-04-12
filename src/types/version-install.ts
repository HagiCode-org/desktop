export interface InstallWebServicePackageOptions {
  // Homepage-triggered installs can opt in to switching the active version
  // after installation, but only when the service is still idle.
  autoSwitchWhenIdle?: boolean;
}

export interface InstallWebServicePackageResult {
  success: boolean;
  autoSwitched: boolean;
  activeVersionId: string | null;
  switchError?: string;
}
