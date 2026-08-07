import type { InterfaceOpeningMethod } from './config.js';

export interface OpenPreferredInterfaceOptions {
  url: unknown;
  method: InterfaceOpeningMethod | undefined;
  openInApp: (url: string) => Promise<boolean>;
  openInBrowser: (url: string) => Promise<boolean>;
  onError: (message: string, error?: unknown) => void;
}

export function isValidServiceUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function openPreferredInterface({
  url,
  method,
  openInApp,
  openInBrowser,
  onError,
}: OpenPreferredInterfaceOptions): Promise<void> {
  if (!isValidServiceUrl(url) || method === undefined) {
    return;
  }

  const opener = method === 'in-app' ? openInApp : openInBrowser;
  try {
    const succeeded = await opener(url);
    if (!succeeded) {
      onError(`Failed to automatically open Hagicode using ${method}`);
    }
  } catch (error) {
    onError(`Failed to automatically open Hagicode using ${method}`, error);
  }
}
