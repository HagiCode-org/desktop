import type { StoredPackageSourceConfig } from '../../main/package-source-config-manager';
import { OFFICIAL_SERVER_HTTP_INDEX_URL } from '../../shared/package-source-defaults';

export type PackageSourceType = StoredPackageSourceConfig['type'];

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
      sourceType: PackageSourceType;
    };

export function resolveSourceTypeChange(
  allConfigs: StoredPackageSourceConfig[],
  sourceType: PackageSourceType,
): SourceTypeChangeResolution {
  const existingSource = allConfigs.find(config => config.type === sourceType);
  if (existingSource) {
    return {
      kind: 'switch-saved-source',
      sourceId: existingSource.id,
    };
  }

  return {
    kind: 'edit-draft',
    sourceType,
  };
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
