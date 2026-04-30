import fs from 'node:fs';
import path from 'node:path';

export type PortableRuntimeMacosPlatform = 'osx-x64' | 'osx-arm64';

export interface PortableBundleManifestMember {
  platform: PortableRuntimeMacosPlatform;
  relativePath: string;
  requiredPaths: string[];
}

export interface PortableBundleManifest {
  schemaVersion: number;
  kind: 'macos-universal';
  publicationPlatform: 'osx-universal';
  currentLayout: string;
  fallbackRule: string;
  manifestPath: string;
  includedPlatforms: PortableRuntimeMacosPlatform[];
  members: PortableBundleManifestMember[];
}

export type PortableRuntimeSelectionSource =
  | 'legacy-current-root'
  | 'bundle-member'
  | 'compatibility-flat-extra-root';

export interface PortableRuntimeSelection {
  bundleRoot: string;
  runtimeRoot: string;
  manifestPath: string | null;
  selectedPlatform: PortableRuntimeMacosPlatform | null;
  selectionSource: PortableRuntimeSelectionSource;
}

export interface PackagedPortableToolchainResolution {
  toolchainRoot: string;
  selectionSource: 'canonical-portable-fixed-root' | 'compatibility-flat-extra-root';
}

export interface PortableRuntimeLayoutReadOptions {
  existsSync?: (targetPath: string) => boolean;
  readFileSync?: (targetPath: string, encoding: BufferEncoding) => string;
}

const PORTABLE_BUNDLE_MANIFEST_FILE = 'bundle-manifest.json';

export function mapProcessArchToMacosPlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): PortableRuntimeMacosPlatform | null {
  if (runtimePlatform !== 'darwin') {
    return null;
  }

  return runtimeArch === 'arm64' ? 'osx-arm64' : 'osx-x64';
}

export function parsePortableBundleManifest(raw: unknown): PortableBundleManifest | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const manifest = raw as Partial<PortableBundleManifest>;
  if (manifest.kind !== 'macos-universal' || !Array.isArray(manifest.members)) {
    return null;
  }

  const members = manifest.members.filter((member): member is PortableBundleManifestMember => (
    !!member &&
    typeof member === 'object' &&
    (member.platform === 'osx-x64' || member.platform === 'osx-arm64') &&
    typeof member.relativePath === 'string' &&
    Array.isArray(member.requiredPaths)
  ));
  if (members.length === 0) {
    return null;
  }

  const includedPlatforms = Array.isArray(manifest.includedPlatforms)
    ? manifest.includedPlatforms.filter((entry): entry is PortableRuntimeMacosPlatform => (
      entry === 'osx-x64' || entry === 'osx-arm64'
    ))
    : members.map((member) => member.platform);

  return {
    schemaVersion: typeof manifest.schemaVersion === 'number' ? manifest.schemaVersion : 1,
    kind: 'macos-universal',
    publicationPlatform: 'osx-universal',
    currentLayout: typeof manifest.currentLayout === 'string'
      ? manifest.currentLayout
      : 'portable-fixed/current/{osx-x64,osx-arm64}',
    fallbackRule: typeof manifest.fallbackRule === 'string'
      ? manifest.fallbackRule
      : 'When this manifest is absent, Desktop must use portable-fixed/current as the legacy single-root payload.',
    manifestPath: typeof manifest.manifestPath === 'string' ? manifest.manifestPath : PORTABLE_BUNDLE_MANIFEST_FILE,
    includedPlatforms,
    members,
  };
}

export function buildPortableRuntimeSelection(
  bundleRoot: string,
  options?: {
    runtimePlatform?: NodeJS.Platform;
    runtimeArch?: string;
    allowBundleManifest?: boolean;
    selectionSource?: PortableRuntimeSelectionSource;
  } & PortableRuntimeLayoutReadOptions,
): PortableRuntimeSelection {
  const existsSync = options?.existsSync ?? fs.existsSync;
  const readFileSync = options?.readFileSync ?? fs.readFileSync;
  const manifestPath = path.join(bundleRoot, PORTABLE_BUNDLE_MANIFEST_FILE);

  if (options?.allowBundleManifest !== false && existsSync(manifestPath)) {
    try {
      const bundleManifest = parsePortableBundleManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
      if (bundleManifest) {
        const selectedPlatform = mapProcessArchToMacosPlatform(
          options?.runtimePlatform,
          options?.runtimeArch,
        );
        if (selectedPlatform) {
          const selectedMember = bundleManifest.members.find((member) => member.platform === selectedPlatform);
          return {
            bundleRoot,
            runtimeRoot: path.join(bundleRoot, selectedMember?.relativePath ?? selectedPlatform),
            manifestPath,
            selectedPlatform,
            selectionSource: 'bundle-member',
          };
        }
      }
    } catch {
      // Invalid manifests are ignored so runtime validation can handle the payload as legacy single-root content.
    }
  }

  return {
    bundleRoot,
    runtimeRoot: bundleRoot,
    manifestPath: existsSync(manifestPath) ? manifestPath : null,
    selectedPlatform: null,
    selectionSource: options?.selectionSource ?? 'legacy-current-root',
  };
}

function hasRequiredRuntimeFiles(
  runtimeRoot: string,
  requiredPaths: readonly string[],
  existsSync: (targetPath: string) => boolean,
): boolean {
  if (!existsSync(runtimeRoot)) {
    return false;
  }

  return requiredPaths.every((relativePath) => existsSync(path.join(runtimeRoot, relativePath)));
}

function hasSelectionEvidence(
  selection: PortableRuntimeSelection,
  existsSync: (targetPath: string) => boolean,
): boolean {
  return existsSync(selection.runtimeRoot)
    || existsSync(selection.bundleRoot)
    || (selection.manifestPath !== null && existsSync(selection.manifestPath));
}

export function resolvePackagedPortableRuntimeSelection(
  resourcesPath: string,
  requiredPaths: readonly string[],
  options?: {
    runtimePlatform?: NodeJS.Platform;
    runtimeArch?: string;
  } & PortableRuntimeLayoutReadOptions,
): PortableRuntimeSelection {
  const existsSync = options?.existsSync ?? fs.existsSync;
  const canonicalSelection = buildPortableRuntimeSelection(
    path.join(resourcesPath, 'extra', 'portable-fixed', 'current'),
    options,
  );
  const compatibilitySelection = buildPortableRuntimeSelection(
    path.join(resourcesPath, 'extra', 'current'),
    {
      ...options,
      allowBundleManifest: false,
      selectionSource: 'compatibility-flat-extra-root',
    },
  );

  if (hasRequiredRuntimeFiles(canonicalSelection.runtimeRoot, requiredPaths, existsSync)) {
    return canonicalSelection;
  }

  if (hasRequiredRuntimeFiles(compatibilitySelection.runtimeRoot, requiredPaths, existsSync)) {
    return compatibilitySelection;
  }

  if (hasSelectionEvidence(canonicalSelection, existsSync)) {
    return canonicalSelection;
  }

  if (hasSelectionEvidence(compatibilitySelection, existsSync)) {
    return compatibilitySelection;
  }

  return canonicalSelection;
}

export function resolvePackagedPortableToolchainRoot(
  resourcesPath: string,
  options?: PortableRuntimeLayoutReadOptions,
): PackagedPortableToolchainResolution {
  const existsSync = options?.existsSync ?? fs.existsSync;
  const canonicalRoot = path.join(resourcesPath, 'extra', 'portable-fixed', 'toolchain');
  if (existsSync(canonicalRoot)) {
    return {
      toolchainRoot: canonicalRoot,
      selectionSource: 'canonical-portable-fixed-root',
    };
  }

  return {
    toolchainRoot: path.join(resourcesPath, 'extra', 'toolchain'),
    selectionSource: 'compatibility-flat-extra-root',
  };
}

