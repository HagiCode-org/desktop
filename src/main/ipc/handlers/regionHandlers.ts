import { ipcMain } from 'electron';
import { RegionDetector } from '../../region-detector.js';

// Module state
let regionDetector: RegionDetector | null = null;

/**
 * Initialize region handlers with dependencies
 */
export function initRegionHandlers(detector: RegionDetector | null): void {
  regionDetector = detector;
}

/**
 * Register region detection IPC handlers
 */
export function registerRegionHandlers(detector: RegionDetector | null): void {
  regionDetector = detector;

  // Region get status handler
  ipcMain.handle('region:get-status', async () => {
    if (!regionDetector) {
      return {
        region: null,
        detectedAt: null,
      };
    }
    try {
      const status = regionDetector.getStatus();
      return {
        ...status,
        detectedAt: status.detectedAt?.toISOString() || null,
      };
    } catch (error) {
      console.error('[RegionHandlers] Failed to get region status:', error);
      return {
        region: null,
        detectedAt: null,
      };
    }
  });

  // Region redetect handler
  ipcMain.handle('region:redetect', async () => {
    if (!regionDetector) {
      return {
        region: null,
        detectedAt: null,
      };
    }
    try {
      const detection = regionDetector.redetect();
      console.log(`[RegionHandlers] Region re-detected: ${detection.region}`);
      return {
        region: detection.region,
        detectedAt: detection.detectedAt.toISOString(),
      };
    } catch (error) {
      console.error('[RegionHandlers] Failed to re-detect region:', error);
      return {
        region: null,
        detectedAt: null,
      };
    }
  });

  console.log('[IPC] Region handlers registered');
}
