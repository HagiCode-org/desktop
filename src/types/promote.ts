export interface PromoteImage {
  key: string;
  width: number;
  height: number;
  alt: string;
}

export interface PromoteItem {
  id: string;
  title: string;
  description: string;
  ctaLabel?: string;
  link: string;
  image?: PromoteImage;
}

export interface PromoteGetItemsRequest {
  language: string;
}

export interface PromoteGetItemsResult {
  items: PromoteItem[];
}

export interface PromoteGetImageRequest {
  key: string;
}

export interface PromoteGetImageResult {
  dataUrl: string | null;
}

export interface PromoteBridge {
  getItems: (request: PromoteGetItemsRequest) => Promise<PromoteGetItemsResult>;
  getImage: (request: PromoteGetImageRequest) => Promise<PromoteGetImageResult>;
}

export const promoteChannels = {
  getItems: 'promote:get-items',
  getImage: 'promote:get-image',
} as const;
