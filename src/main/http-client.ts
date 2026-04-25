export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface HttpRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: BodyInit | object | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  validateStatus?: (status: number) => boolean;
}

export interface BinaryRequestOptions extends HttpRequestOptions {
  onDownloadProgress?: (progress: { loaded: number; total?: number }) => void;
}

export interface HttpResponse<T> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

export class HttpTimeoutError extends Error {
  readonly code = 'ETIMEDOUT';
  readonly timeoutMs: number;

  constructor(timeoutMs: number, url: string) {
    super(`Request timed out after ${timeoutMs}ms: ${url}`);
    this.name = 'HttpTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class HttpStatusError<TBody = unknown> extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: TBody;

  constructor(response: HttpResponse<TBody>, url: string) {
    super(`HTTP ${response.status} ${response.statusText || ''} for ${url}`.trim());
    this.name = 'HttpStatusError';
    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.body = response.data;
  }
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function prepareBody(options: HttpRequestOptions): BodyInit | null | undefined {
  if (options.body === null || options.body === undefined) {
    return options.body;
  }
  if (
    typeof options.body === 'string' ||
    options.body instanceof ArrayBuffer ||
    options.body instanceof Blob ||
    options.body instanceof FormData ||
    options.body instanceof URLSearchParams
  ) {
    return options.body;
  }
  return JSON.stringify(options.body);
}

function prepareHeaders(options: HttpRequestOptions): Record<string, string> {
  const headers = { ...(options.headers ?? {}) };
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
  const shouldSetJsonContentType =
    options.body !== null &&
    options.body !== undefined &&
    typeof options.body === 'object' &&
    !(options.body instanceof ArrayBuffer) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams);

  if (shouldSetJsonContentType && !hasContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function executeFetch(url: string, options: HttpRequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs;
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;

  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal) {
    if (options.signal.aborted) {
      abortFromCaller();
    } else {
      options.signal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  if (timeoutMs && timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new HttpTimeoutError(timeoutMs, url));
    }, timeoutMs);
  }

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: prepareHeaders(options),
      body: prepareBody(options),
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new HttpTimeoutError(timeoutMs ?? 0, url);
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

async function readStatusBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function createResponse<T>(url: string, response: Response, data: T, validateStatus?: (status: number) => boolean): Promise<HttpResponse<T>> {
  const result: HttpResponse<T> = {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeHeaders(response.headers),
    data,
  };
  const isValid = validateStatus ? validateStatus(response.status) : response.status >= 200 && response.status < 300;
  if (!isValid) {
    throw new HttpStatusError(result, url);
  }
  return result;
}

export async function requestText(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<string>> {
  const response = await executeFetch(url, options);
  const data = await response.text();
  return createResponse(url, response, data, options.validateStatus);
}

export async function requestJson<T>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
  const response = await executeFetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) as T : undefined as T;
  return createResponse(url, response, data, options.validateStatus);
}

export async function requestBinary(url: string, options: BinaryRequestOptions = {}): Promise<HttpResponse<Buffer>> {
  const response = await executeFetch(url, options);
  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : undefined;

  if (!response.ok && !options.validateStatus) {
    const body = await readStatusBody(response);
    await createResponse(url, response, body, options.validateStatus);
  }

  const isValid = options.validateStatus ? options.validateStatus(response.status) : response.status >= 200 && response.status < 300;
  if (!isValid) {
    const body = await readStatusBody(response);
    await createResponse(url, response, body, options.validateStatus);
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    options.onDownloadProgress?.({ loaded: buffer.length, total });
    return createResponse(url, response, buffer, options.validateStatus);
  }

  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    loaded += chunk.length;
    options.onDownloadProgress?.({ loaded, total });
  }

  return createResponse(url, response, Buffer.concat(chunks), options.validateStatus);
}

export const desktopHttpClient = {
  requestJson,
  requestText,
  requestBinary,
};

export type DesktopHttpClient = typeof desktopHttpClient;
