export const OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL = 'https://index.hagicode.com/server/index.json';
export const OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL = 'https://dl-server.hagicode.com/index.json';
export const OFFICIAL_SERVER_HTTP_INDEX_URL = OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL;

const LEGACY_OFFICIAL_SERVER_HTTP_INDEX_URLS = new Set([
  'https://server.dl.hagicode.com/index.json',
]);

export function normalizeOfficialServerHttpIndexUrl(indexUrl?: string): string | undefined {
  if (!indexUrl) {
    return indexUrl;
  }

  return LEGACY_OFFICIAL_SERVER_HTTP_INDEX_URLS.has(indexUrl)
    ? OFFICIAL_SERVER_HTTP_INDEX_URL
    : indexUrl;
}
