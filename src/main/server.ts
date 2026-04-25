import { desktopHttpClient } from './http-client.js';

export type ServerStatus = 'running' | 'stopped' | 'error';

export interface ServerConfig {
  host: string;
  port: number;
  apiKey?: string;
}

export interface ServerInfo {
  status: ServerStatus;
  version: string;
  uptime: number;
  startTime?: string;
}

interface ServerStatusResponse {
  running?: boolean;
  version?: string;
  uptime?: number;
  startTime?: string;
}

export class HagicoServerClient {
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async getStatus(): Promise<ServerInfo> {
    try {
      const response = await this.get<ServerStatusResponse>('/api/status');
      return {
        status: response.running ? 'running' : 'stopped',
        version: response.version || 'unknown',
        uptime: response.uptime || 0,
        startTime: response.startTime,
      };
    } catch (error) {
      return {
        status: 'error',
        version: 'unknown',
        uptime: 0,
      };
    }
  }

  async startServer(): Promise<boolean> {
    try {
      await this.post('/api/server/start');
      return true;
    } catch (error) {
      console.error('Failed to start server:', error);
      return false;
    }
  }

  async stopServer(): Promise<boolean> {
    try {
      await this.post('/api/server/stop');
      return true;
    } catch (error) {
      console.error('Failed to stop server:', error);
      return false;
    }
  }

  async restartServer(): Promise<boolean> {
    try {
      await this.post('/api/server/restart');
      return true;
    } catch (error) {
      console.error('Failed to restart server:', error);
      return false;
    }
  }

  updateConfig(config: Partial<ServerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get('/api/health');
      return true;
    } catch {
      return false;
    }
  }

  private buildUrl(path: string): string {
    return `http://${this.config.host}:${this.config.port}${path}`;
  }

  private buildHeaders(): Record<string, string> {
    return this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {};
  }

  private async get<T>(path: string): Promise<T> {
    const response = await desktopHttpClient.requestJson<T>(this.buildUrl(path), {
      timeoutMs: 5000,
      headers: this.buildHeaders(),
    });
    return response.data;
  }

  private async post(path: string): Promise<void> {
    await desktopHttpClient.requestText(this.buildUrl(path), {
      method: 'POST',
      timeoutMs: 5000,
      headers: this.buildHeaders(),
    });
  }
}

