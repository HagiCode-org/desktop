export type PathVirtualizationKind = 'none' | 'windows-store-appdata';

export interface PathDisplayInfo {
  logicalPath: string;
  displayPath: string;
  physicalPath: string | null;
  virtualizationKind: PathVirtualizationKind;
}
