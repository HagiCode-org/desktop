export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export type NotificationTransport =
  | 'macos-notification-center'
  | 'windows-toast'
  | 'linux-libnotify';

export type NotificationClickAction =
  | { type: 'open-url'; url: string }
  | { type: 'focus-window' };

export interface NotificationParams {
  title: string;
  body: string;
  level: NotificationLevel;
  clickAction?: NotificationClickAction;
  duration?: number;
  icon?: string;
  silent?: boolean;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
  notificationId?: string;
  transport?: NotificationTransport;
}

export interface NotificationShownPayload {
  notificationId: string;
  transport: NotificationTransport;
}

export interface NotificationClickedPayload {
  notificationId: string;
  transport: NotificationTransport;
  actionType: NotificationClickAction['type'];
}

export interface HagihubApi {
  sendNotification: (params: NotificationParams) => Promise<NotificationResult>;
  onNotificationClicked: (callback: (payload: NotificationClickedPayload) => void) => () => void;
  onNotificationShown: (callback: (payload: NotificationShownPayload) => void) => () => void;
}
