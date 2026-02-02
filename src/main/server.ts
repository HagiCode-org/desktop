import axios, { AxiosInstance } from 'axios';

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

export class HagicoServerClient {
  private client: AxiosInstance;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `http://${config.host}:${config.port}`,
      timeout: 5000,
      headers: config.apiKey ? { 'X-API-Key': config.apiKey } : {},
    });
  }

  async getStatus(): Promise<ServerInfo> {
    try {
      const response = await this.client.get('/api/status');
      return {
        status: response.data.running ? 'running' : 'stopped',
        version: response.data.version || 'unknown',
        uptime: response.data.uptime || 0,
        startTime: response.data.startTime,
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
      await this.client.post('/api/server/start');
      return true;
    } catch (error) {
      console.error('Failed to start server:', error);
      return false;
    }
  }

  async stopServer(): Promise<boolean> {
    try {
      await this.client.post('/api/server/stop');
      return true;
    } catch (error) {
      console.error('Failed to stop server:', error);
      return false;
    }
  }

  async restartServer(): Promise<boolean> {
    try {
      await this.client.post('/api/server/restart');
      return true;
    } catch (error) {
      console.error('Failed to restart server:', error);
      return false;
    }
  }

  updateConfig(config: Partial<ServerConfig>): void {
    this.config = { ...this.config, ...config };
    this.client = axios.create({
      baseURL: `http://${this.config.host}:${this.config.port}`,
      timeout: 5000,
      headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/api/health');
      return true;
    } catch {
      return false;
    }
  }
}
