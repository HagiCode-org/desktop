export const DEFAULT_WEB_SERVICE_HOST = 'localhost';
export const DEFAULT_WEB_SERVICE_PORT = 36556;

export const LISTEN_HOST_PRESETS = ['localhost', '127.0.0.1', '0.0.0.0'] as const;

export type ListenHostPreset = (typeof LISTEN_HOST_PRESETS)[number] | 'custom';

export function isValidIpv4Address(value: string): boolean {
  const trimmed = value.trim();
  const segments = trimmed.split('.');

  if (segments.length !== 4) {
    return false;
  }

  return segments.every((segment) => {
    if (!/^\d+$/.test(segment)) {
      return false;
    }

    const numeric = Number.parseInt(segment, 10);
    return numeric >= 0 && numeric <= 255;
  });
}

export function normalizeListenHost(value?: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0') {
    return normalized;
  }

  return isValidIpv4Address(trimmed) ? trimmed : null;
}

export function coerceListenHost(value?: string | null, fallback: string = DEFAULT_WEB_SERVICE_HOST): string {
  return normalizeListenHost(value) ?? fallback;
}

export function isValidListenHost(value?: string | null): boolean {
  return normalizeListenHost(value) !== null;
}

export function resolveListenHostPreset(value?: string | null): ListenHostPreset {
  const normalized = normalizeListenHost(value);

  if (normalized && LISTEN_HOST_PRESETS.includes(normalized as (typeof LISTEN_HOST_PRESETS)[number])) {
    return normalized as ListenHostPreset;
  }

  return 'custom';
}

export function deriveAccessHost(value?: string | null): string {
  const normalized = coerceListenHost(value);
  return normalized === '0.0.0.0' ? '127.0.0.1' : normalized;
}

export function buildAccessUrl(host: string, port: number): string {
  return `http://${deriveAccessHost(host)}:${port}`;
}

export function resolveProbeHostsForListenHost(value?: string | null): string[] {
  const normalized = coerceListenHost(value);

  if (normalized === '0.0.0.0') {
    return ['127.0.0.1', 'localhost'];
  }

  if (normalized === 'localhost') {
    return ['localhost', '127.0.0.1'];
  }

  return [normalized];
}
