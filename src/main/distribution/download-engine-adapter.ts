import type { Version } from '../version-manager.js';
import type { SharingAccelerationSettings, VersionDownloadProgress } from '../../types/sharing-acceleration.js';

export interface DownloadEngineAdapter {
  download(
    version: Version,
    destinationPath: string,
    settings: SharingAccelerationSettings,
    onProgress?: (progress: VersionDownloadProgress) => void,
  ): Promise<void>;

  stopAll(): Promise<void>;
}
