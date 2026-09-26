import type { StoredPackageSourceConfig } from '../../main/package-source-config-manager';
import {
  OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
  OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
  OFFICIAL_SERVER_HTTP_INDEX_URL,
} from '../../shared/package-source-defaults.js';

export type PackageSourceType = StoredPackageSourceConfig['type'];
export type PackageSourceChoice = 'mainland' | 'international' | 'local-folder' | `saved:${string}`;

export const officialIndexUrls = {
  mainland: OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
  international: OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
};

export type EditablePackageSourceConfig =
  | {
      type: 'local-folder';
      name: string;
      path: string;
    }
  | {
      type: 'http-index';
      name: string;
      indexUrl: string;
    };

export type SourceTypeChangeResolution =
  | {
      kind: 'switch-saved-source';
      sourceId: string;
    }
  | {
      kind: 'edit-draft';
      sourceType: 'local-folder';
    }
  | {
      kind: 'create-official-source';
      indexUrl: string;
    };

export function resolveSourceChoice(
  allConfigs: StoredPackageSourceConfig[],
  choice: string,
): SourceTypeChangeResolution {
  if (choice.startsWith('saved:')) {
    const sourceId = choice.slice('saved:'.length);
    const savedSource = allConfigs.find(config => config.id === sourceId && config.type === 'http-index');
    if (!savedSource) {
      throw new Error(`Unknown saved custom package source: ${sourceId}`);
    }
    return { kind: 'switch-saved-source', sourceId: savedSource.id };
  }

  if (choice !== 'mainland' && choice !== 'international' && choice !== 'local-folder') {
    throw new Error(`Unsupported package source choice: ${choice}`);
  }

  const existingSource = allConfigs.find(config => choice === 'local-folder'
    ? config.type === 'local-folder'
    : config.type === 'http-index' && config.indexUrl === officialIndexUrls[choice]);
  if (existingSource) {
    return {
      kind: 'switch-saved-source',
      sourceId: existingSource.id,
    };
  }

  return choice === 'local-folder'
    ? { kind: 'edit-draft', sourceType: 'local-folder' }
    : { kind: 'create-official-source', indexUrl: officialIndexUrls[choice] };
}

export function getSelectedSourceChoice(
  currentConfig: StoredPackageSourceConfig | null,
  sourceType: PackageSourceType,
): PackageSourceChoice | undefined {
  if (sourceType === 'local-folder') {
    return 'local-folder';
  }
  if (currentConfig?.type !== 'http-index') {
    return undefined;
  }
  return (Object.keys(officialIndexUrls) as Array<'mainland' | 'international'>)
    .find(region => currentConfig.indexUrl === officialIndexUrls[region]);
}

export function buildDraftSourceConfig(params: {
  sourceType: PackageSourceType;
  folderPath: string;
  httpIndexUrl: string;
  folderSourceName: string;
  httpIndexSourceName: string;
}): EditablePackageSourceConfig {
  const {
    sourceType,
    folderPath,
    httpIndexUrl,
    folderSourceName,
    httpIndexSourceName,
  } = params;

  if (sourceType === 'local-folder') {
    return {
      type: 'local-folder',
      name: folderSourceName,
      path: folderPath,
    };
  }

  return {
    type: 'http-index',
    name: httpIndexSourceName,
    indexUrl: httpIndexUrl || OFFICIAL_SERVER_HTTP_INDEX_URL,
  };
}

export function hasPackageSourceDraftChanges(params: {
  currentConfig: StoredPackageSourceConfig | null;
  sourceType: PackageSourceType;
  folderPath: string;
  httpIndexUrl: string;
}): boolean {
  const {
    currentConfig,
    sourceType,
    folderPath,
    httpIndexUrl,
  } = params;

  const currentSourceType = currentConfig?.type ?? 'http-index';
  if (sourceType !== currentSourceType) {
    return true;
  }

  if (sourceType === 'local-folder') {
    const currentFolderPath = currentConfig?.type === 'local-folder'
      ? currentConfig.path || ''
      : '';
    return folderPath !== currentFolderPath;
  }

  const currentHttpIndexUrl = currentConfig?.type === 'http-index'
    ? currentConfig.indexUrl || OFFICIAL_SERVER_HTTP_INDEX_URL
    : OFFICIAL_SERVER_HTTP_INDEX_URL;
  return httpIndexUrl !== currentHttpIndexUrl;
}
