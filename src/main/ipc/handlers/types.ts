/**
 * Shared TypeScript types for IPC handlers
 */

/**
 * Success response from a handler
 */
export interface HandlerSuccess<T> {
  success: true;
  data: T;
}

/**
 * Error response from a handler
 */
export interface HandlerError {
  success: false;
  error: string;
}

/**
 * Generic handler response type
 */
export type HandlerResponse<T> = HandlerSuccess<T> | HandlerError;

/**
 * IPC Handler function type
 */
export type IpcHandler<T = unknown, R = unknown> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: T[]
) => Promise<R>;
