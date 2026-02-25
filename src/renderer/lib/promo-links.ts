/**
 * Promo Links Configuration (Renderer)
 * Matches Compose Web configuration (repos/docker-compose-builder-web/src/lib/links.ts)
 */

/**
 * Promo Link Configuration Interface
 */
export interface PromoLinkConfig {
  url: string;
  label: string;
  title: string;
  description?: string;
}

/**
 * Promo Links Configuration Object
 * Provider-specific promotion links for API key acquisition
 * Matches Compose Web PROMO_LINKS configuration
 */
export const PROMO_LINKS: Record<string, PromoLinkConfig> = {
  anthropic: {
    url: '#',
    label: 'Get API Token',
    title: 'Anthropic Official API',
    description: 'Anthropic Official API',
  },
  zai: {
    url: 'https://www.bigmodel.cn/claude-code?ic=14BY54APZA',
    label: 'Get API Token',
    title: 'Zhipu AI Claude Code',
    description: '智谱 AI Claude Code',
  },
  aliyun: {
    url: 'https://www.aliyun.com/benefit/ai/aistar?userCode=vmx5szbq&clubBiz=subTask..12384055..10263..',
    label: 'Get API Token',
    title: 'Aliyun Qianwen Coding Plan',
    description: '阿里云千问 Coding Plan 已上线',
  },
  minimax: {
    url: 'https://platform.minimaxi.com/subscribe/coding-plan?code=8wNck4etDM&source=link',
    label: 'Get API Token',
    title: 'MiniMax',
    description: 'MiniMax 提供的 Claude API 兼容服务',
  },
  custom: {
    url: '#',
    label: 'Get API Token',
    title: 'Custom Endpoint',
    description: '自定义端点',
  },
};

/**
 * Get promo link configuration for a provider
 */
export function getPromoLinkConfig(provider: string): PromoLinkConfig {
  return PROMO_LINKS[provider] || PROMO_LINKS.anthropic;
}

/**
 * Get promo link URL for a provider
 */
export function getPromoLinkUrl(provider: string): string {
  const config = getPromoLinkConfig(provider);
  return config.url;
}

/**
 * Get promo link button label for a provider
 */
export function getPromoLinkLabel(provider: string): string {
  const config = getPromoLinkConfig(provider);
  return config.label;
}

/**
 * Get promo link title for a provider
 */
export function getPromoLinkTitle(provider: string): string {
  const config = getPromoLinkConfig(provider);
  return config.title;
}
