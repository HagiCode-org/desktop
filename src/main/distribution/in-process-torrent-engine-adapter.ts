import fsPromises from 'node:fs/promises';
import path from 'node:path';
import WebTorrent from 'webtorrent';
import log from 'electron-log';
import type { Version } from '../version-manager.js';
import type { SharingAccelerationSettings, VersionDownloadProgress } from '../../types/sharing-acceleration.js';
import type { DownloadEngineAdapter } from './download-engine-adapter.js';

type TorrentFileLike = {
  name: string;
  path: string;
};

type TorrentLike = {
  downloaded: number;
  length: number;
  numPeers: number;
  files: TorrentFileLike[];
  path: string;
  wires: Array<{ type?: string }>;
  addWebSeed: (url: string) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  destroy: (options?: unknown, callback?: () => void) => void;
};

export class InProcessTorrentEngineAdapter implements DownloadEngineAdapter {
  private client: WebTorrent.Instance | null = null;
  private activeTorrents = new Map<string, TorrentLike>();

  async download(
    version: Version,
    destinationPath: string,
    settings: SharingAccelerationSettings,
    onProgress?: (progress: VersionDownloadProgress) => void,
  ): Promise<void> {
    const hybrid = version.hybrid;
    if (!hybrid?.torrentUrl && !hybrid?.infoHash) {
      throw new Error('Hybrid metadata is required for the in-process adapter');
    }

    await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true });

    const client = this.getClient(settings);
    const torrentId = hybrid.torrentUrl ?? hybrid.infoHash!;

    await new Promise<void>((resolve, reject) => {
      let lastDownloaded = 0;
      let p2pBytes = 0;
      let fallbackBytes = 0;
      let settled = false;

      const torrent = client.add(torrentId, {
        path: path.dirname(destinationPath),
        destroyStoreOnDestroy: false,
        maxWebConns: 8,
      }) as unknown as TorrentLike;

      this.activeTorrents.set(version.id, torrent);

      const finish = async () => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          const sourceFile = this.resolveTorrentOutputFile(torrent, version.packageFilename);
          if (sourceFile !== destinationPath) {
            await fsPromises.copyFile(sourceFile, destinationPath);
          }
          this.activeTorrents.delete(version.id);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      const fail = async (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        this.activeTorrents.delete(version.id);
        await fsPromises.rm(destinationPath, { force: true }).catch(() => undefined);
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const reportProgress = () => {
        const current = torrent.downloaded;
        const delta = Math.max(0, current - lastDownloaded);
        lastDownloaded = current;
        const hasP2PPeer = torrent.wires.some((wire) => wire.type !== 'webSeed');
        const hasFallbackWire = torrent.wires.some((wire) => wire.type === 'webSeed');
        const mode = hasP2PPeer ? 'shared-acceleration' : hasFallbackWire ? 'source-fallback' : 'shared-acceleration';
        const stage = hasP2PPeer ? 'downloading' : hasFallbackWire ? 'backfilling' : 'downloading';

        if (delta > 0) {
          if (hasP2PPeer) {
            p2pBytes += delta;
          } else {
            fallbackBytes += delta;
          }
        }

        const total = torrent.length || version.size || 0;
        const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        onProgress?.({
          current,
          total,
          percentage,
          stage,
          mode,
          peers: torrent.numPeers,
          p2pBytes,
          fallbackBytes,
          message: mode === 'shared-acceleration' ? 'shared-acceleration-active' : 'source-fallback-active',
          serviceScope: hybrid.serviceScope,
        });
      };

      torrent.on('ready', () => {
        for (const seed of hybrid.webSeeds) {
          torrent.addWebSeed(seed);
        }
        if (hybrid.directUrl) {
          torrent.addWebSeed(hybrid.directUrl);
        }
        onProgress?.({
          current: torrent.downloaded,
          total: torrent.length || version.size || 0,
          percentage: 0,
          stage: 'fetching-torrent',
          mode: 'shared-acceleration',
          peers: torrent.numPeers,
          p2pBytes,
          fallbackBytes,
          message: 'torrent-metadata-ready',
          serviceScope: hybrid.serviceScope,
        });
        reportProgress();
      });

      torrent.on('download', reportProgress);
      torrent.on('wire', reportProgress);
      torrent.on('done', () => {
        reportProgress();
        void finish();
      });
      torrent.on('warning', (warning) => {
        log.warn('[InProcessTorrentEngineAdapter] Torrent warning:', warning);
        reportProgress();
      });
      torrent.on('error', (error) => {
        void fail(error);
      });

      onProgress?.({
        current: 0,
        total: version.size ?? 0,
        percentage: 0,
        stage: 'fetching-torrent',
        mode: 'shared-acceleration',
        peers: 0,
        p2pBytes: 0,
        fallbackBytes: 0,
        message: 'fetching-torrent-metadata',
        serviceScope: hybrid.serviceScope,
      });
    });
  }

  async stopAll(): Promise<void> {
    const torrents = [...this.activeTorrents.values()];
    this.activeTorrents.clear();

    await Promise.all(torrents.map((torrent) => new Promise<void>((resolve) => {
      torrent.destroy({ destroyStore: false }, resolve);
    })));

    if (this.client) {
      await new Promise<void>((resolve) => this.client?.destroy(() => resolve()));
      this.client = null;
    }
  }

  private getClient(settings: SharingAccelerationSettings): WebTorrent.Instance {
    const uploadLimitBytes = settings.uploadLimitMbps * 1024 * 1024;
    if (!this.client) {
      this.client = new WebTorrent({
        uploadLimit: uploadLimitBytes,
      });
    } else {
      this.client.throttleUpload(uploadLimitBytes);
    }
    return this.client;
  }

  private resolveTorrentOutputFile(torrent: TorrentLike, packageFilename: string): string {
    const matchingFile = torrent.files.find((file) => file.name === packageFilename) ?? torrent.files[0];
    if (!matchingFile) {
      throw new Error('Torrent finished without any files');
    }
    return path.join(torrent.path, matchingFile.path);
  }
}
