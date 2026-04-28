export interface HagiNodeRuntimeMetadata {
  nodeVersion: string | null;
  nodeMajorVersion: string;
  npmGlobalPath: string;
  npmGlobalBinPath: string;
  npmGlobalModulesPath: string;
}

export interface HagiNodeRuntimeBridge {
  getMetadata: () => Promise<HagiNodeRuntimeMetadata>;
}
