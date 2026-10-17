import { resolveSiteLinks } from '@hagicode/hagilight-core/links';

export interface RelatedSiteEntry {
  id: string;
  name: string;
  description?: string;
  href: string;
}

export interface RelatedSitesModel {
  title: string;
  entries: RelatedSiteEntry[];
}

export type RelatedSitesResolver = typeof resolveSiteLinks;

/**
 * Builds the sidebar's related-sites view model from the hagilight core package.
 * No siteId is passed on purpose: Desktop is not a registered core site, and
 * passing one would hide that site and append web-footer campaign UTM parameters.
 * Returns null when there is nothing to show or when resolution throws, so the
 * About area and sidebar navigation are never affected by related-site data.
 */
export function buildRelatedSitesModel(
  locale: string | null | undefined,
  resolver: RelatedSitesResolver = resolveSiteLinks,
): RelatedSitesModel | null {
  try {
    const resolved = resolver(locale);
    if (resolved.relatedSites.length === 0) {
      return null;
    }

    return {
      title: resolved.labels.relatedSites,
      entries: resolved.relatedSites.map((site) => ({
        id: site.id,
        name: site.name,
        description: site.description,
        href: site.href,
      })),
    };
  } catch (error) {
    console.error('Failed to resolve related sites:', error);
    return null;
  }
}
