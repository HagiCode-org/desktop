/**
 * License type definitions
 */

/**
 * License data structure (minimal)
 */
export interface LicenseData {
  licenseKey: string;      // License key
  isConfigured: boolean;   // Whether license is configured
  updatedAt: string;       // Last update timestamp
}

/**
 * License sync status information
 */
export interface LicenseSyncStatus {
  synced: boolean;
  licenseKey?: string;
  isDefault?: boolean;
  source: 'existing' | 'default' | 'manual';
  timestamp: string;
  syncedVersions?: number; // Number of versions that were synced
}

/**
 * Default public beta license key
 */
export const DEFAULT_LICENSE_KEY = 'D76B5C-EC0A70-AEA453-BC9414-0A198D-V3';
