import type { BrowserWindow, Notification as ElectronNotificationInstance, NotificationConstructorOptions } from 'electron';
import { electron } from '../../electron-api.js';
import type {
  NotificationClickedPayload,
  NotificationParams,
  NotificationResult,
  NotificationShownPayload,
  NotificationTransport,
} from '../../shared/api.js';

const { Notification: ElectronNotification, shell } = electron;
const NOTIFICATION_SHOW_TIMEOUT_MS = 5000;

type NotificationChannel = 'hagihub:notification-clicked' | 'hagihub:notification-shown';

type NotificationLike = Pick<ElectronNotificationInstance, 'close' | 'on' | 'show'>;

interface NotificationLikeConstructor {
  new (options: NotificationConstructorOptions): NotificationLike;
  isSupported?: () => boolean;
}

interface NotificationServiceOptions {
  getMainWindow: () => BrowserWindow | null;
  activateMainWindow: (reason: string) => void;
  openExternal?: (url: string) => Promise<void>;
  notificationClass?: NotificationLikeConstructor;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
}

function resolveTransport(platform: NodeJS.Platform): NotificationTransport | null {
  if (platform === 'darwin') {
    return 'macos-notification-center';
  }

  if (platform === 'win32') {
    return 'windows-toast';
  }

  if (platform === 'linux') {
    return 'linux-libnotify';
  }

  return null;
}

function mapLinuxUrgency(level: NotificationParams['level']): NotificationConstructorOptions['urgency'] {
  switch (level) {
    case 'error':
      return 'critical';
    case 'warning':
      return 'normal';
    default:
      return 'low';
  }
}

export class NotificationService {
  private readonly getMainWindow: NotificationServiceOptions['getMainWindow'];
  private readonly activateMainWindow: NotificationServiceOptions['activateMainWindow'];
  private readonly openExternal: (url: string) => Promise<void>;
  private readonly notificationClass: NotificationLikeConstructor;
  private readonly platform: NodeJS.Platform;
  private readonly timeoutMs: number;
  private sequence = 0;

  constructor(options: NotificationServiceOptions) {
    this.getMainWindow = options.getMainWindow;
    this.activateMainWindow = options.activateMainWindow;
    this.openExternal = options.openExternal ?? (async (url: string) => {
      await shell.openExternal(url, { activate: true });
    });
    this.notificationClass = options.notificationClass ?? ElectronNotification;
    this.platform = options.platform ?? process.platform;
    this.timeoutMs = options.timeoutMs ?? NOTIFICATION_SHOW_TIMEOUT_MS;
  }

  async send(params: NotificationParams): Promise<NotificationResult> {
    const transport = resolveTransport(this.platform);
    if (!transport) {
      return {
        success: false,
        error: `Notifications are not supported on platform: ${this.platform}`,
      };
    }

    if (typeof this.notificationClass.isSupported === 'function' && !this.notificationClass.isSupported()) {
      return {
        success: false,
        error: 'Notifications are not supported by the current desktop environment.',
      };
    }

    const notificationId = this.createNotificationId();
    const notification = new this.notificationClass(this.buildOptions(params, transport));

    return await new Promise<NotificationResult>((resolve) => {
      let settled = false;
      let timeoutHandle: NodeJS.Timeout | null = null;
      const finish = (result: NotificationResult) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve(result);
      };

      notification.on('show', () => {
        this.emitShown({ notificationId, transport });

        if (typeof params.duration === 'number' && params.duration > 0 && typeof notification.close === 'function') {
          setTimeout(() => notification.close(), params.duration);
        }

        finish({
          success: true,
          notificationId,
          transport,
        });
      });

      notification.on('click', () => {
        void this.handleClick(notificationId, transport, params);
      });

      timeoutHandle = setTimeout(() => {
        finish({
          success: false,
          error: `Notification display timed out after ${this.timeoutMs}ms.`,
          notificationId,
          transport,
        });
      }, this.timeoutMs);

      try {
        notification.show();
      } catch (error) {
        finish({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          notificationId,
          transport,
        });
      }
    });
  }

  private buildOptions(
    params: NotificationParams,
    transport: NotificationTransport,
  ): NotificationConstructorOptions {
    return {
      title: params.title,
      body: params.body,
      icon: params.icon,
      silent: params.silent ?? false,
      timeoutType: params.duration === 0 ? 'never' : 'default',
      urgency: transport === 'linux-libnotify' ? mapLinuxUrgency(params.level) : undefined,
    };
  }

  private async handleClick(
    notificationId: string,
    transport: NotificationTransport,
    params: NotificationParams,
  ): Promise<void> {
    const action = params.clickAction ?? { type: 'focus-window' as const };

    try {
      if (action.type === 'open-url') {
        await this.openExternal(action.url);
      } else {
        this.activateMainWindow('notification-click');
      }
    } finally {
      const payload: NotificationClickedPayload = {
        notificationId,
        transport,
        actionType: action.type,
      };
      this.emitToRenderer('hagihub:notification-clicked', payload);
    }
  }

  private emitShown(payload: NotificationShownPayload): void {
    this.emitToRenderer('hagihub:notification-shown', payload);
  }

  private emitToRenderer(channel: NotificationChannel, payload: NotificationClickedPayload | NotificationShownPayload): void {
    const mainWindow = this.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send(channel, payload);
  }

  private createNotificationId(): string {
    this.sequence += 1;
    return `notification-${Date.now()}-${this.sequence}`;
  }
}

export default NotificationService;
