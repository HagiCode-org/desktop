import fsSync from 'node:fs';
import path from 'node:path';
import { BundledNodeRuntimeManager } from './bundled-node-runtime-manager.js';
import { validateBundledRuntimeForPlatform } from './embedded-runtime.js';
import { PathManager } from './path-manager.js';

export interface NonInteractiveRuntimeComponentReport {
  ok: boolean;
  status: string;
  root: string;
  issues: string[];
}

export interface NonInteractiveRuntimeVerificationReport {
  ok: boolean;
  mode: 'development' | 'packaged';
  manifestPath: string;
  programHome: string;
  programHomeExists: boolean;
  dataHome: string;
  dataHomeExists: boolean;
  sharedPaths: {
    config: string;
    logs: string;
    data: string;
    state: string;
  };
  components: {
    dotnet: NonInteractiveRuntimeComponentReport & {
      executablePath: string;
      aspNetCoreVersion: string | null;
      netCoreVersion: string | null;
      hostFxrVersion: string | null;
      runtimeSource: string | null;
    };
    node: NonInteractiveRuntimeComponentReport & {
      manifestPath: string;
      activeForDesktop: boolean;
      nodeExecutablePath: string | null;
      npmExecutablePath: string | null;
      governedNodeVersion: string | null;
    };
  };
  issues: string[];
}

function flattenIssues(parts: Array<string | null | undefined | false | string[]>): string[] {
  return parts.flatMap((part) => {
    if (!part) {
      return [];
    }
    return Array.isArray(part) ? part : [part];
  });
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function verifyDesktopRuntimeStructure(
  pathManager: PathManager = PathManager.getInstance(),
): Promise<NonInteractiveRuntimeVerificationReport> {
  const manifestPath = pathManager.getDesktopRuntimeManifestPath();
  const programHome = pathManager.getRuntimeProgramHome();
  const dataHome = pathManager.getRuntimeDataHome();
  const sharedPaths = pathManager.getRuntimeSharedPaths();
  const dotnetValidation = await validateBundledRuntimeForPlatform({
    platform: pathManager.getCurrentPlatform(),
    runtimeRoot: pathManager.getEmbeddedRuntimeRoot(),
    executableName: pathManager.getEmbeddedDotnetExecutableName(),
  });
  const nodeValidation = await new BundledNodeRuntimeManager(pathManager).verify();

  const dotnetIssues = flattenIssues([
    !dotnetValidation.valid && dotnetValidation.message,
    dotnetValidation.runtimeValidation.missingComponents,
    !isWithinRoot(dotnetValidation.runtimeRoot, programHome) && `dotnet runtime root is outside runtime program home: ${dotnetValidation.runtimeRoot}`,
  ]);
  const nodeRuntimeComponent = nodeValidation.components.node;
  const npmRuntimeComponent = nodeValidation.components.npm;
  const nodeIssues = flattenIssues([
    nodeValidation.errors,
    nodeRuntimeComponent.integrity !== 'ok' && (nodeRuntimeComponent.message ?? nodeRuntimeComponent.componentId),
    npmRuntimeComponent.integrity !== 'ok' && (npmRuntimeComponent.message ?? npmRuntimeComponent.componentId),
    !isWithinRoot(nodeValidation.toolchainRoot, programHome) && `node runtime root is outside runtime program home: ${nodeValidation.toolchainRoot}`,
  ]);
  const report: NonInteractiveRuntimeVerificationReport = {
    ok: dotnetIssues.length === 0
      && nodeIssues.length === 0,
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'packaged',
    manifestPath,
    programHome,
    programHomeExists: fsSync.existsSync(programHome),
    dataHome,
    dataHomeExists: fsSync.existsSync(dataHome),
    sharedPaths,
    components: {
      dotnet: {
        ok: dotnetIssues.length === 0,
        status: dotnetIssues.length === 0 ? 'ok' : 'error',
        root: dotnetValidation.runtimeRoot,
        executablePath: dotnetValidation.runtimeValidation.dotnetPath,
        aspNetCoreVersion: dotnetValidation.runtimeValidation.aspNetCoreVersion ?? null,
        netCoreVersion: dotnetValidation.runtimeValidation.netCoreVersion ?? null,
        hostFxrVersion: dotnetValidation.runtimeValidation.hostFxrVersion ?? null,
        runtimeSource: dotnetValidation.runtimeSource ?? dotnetValidation.pinnedRuntimeValidation.metadata?.downloadUrl ?? null,
        issues: dotnetIssues,
      },
      node: {
        ok: nodeIssues.length === 0,
        status: nodeIssues.length === 0 ? 'ok' : 'error',
        root: nodeValidation.toolchainRoot,
        manifestPath: nodeValidation.manifestPath,
        activeForDesktop: nodeValidation.activeForDesktop,
        nodeExecutablePath: nodeRuntimeComponent.executablePath ?? null,
        npmExecutablePath: npmRuntimeComponent.executablePath ?? null,
        governedNodeVersion: nodeValidation.manifest?.node?.version ?? null,
        issues: nodeIssues,
      },
    },
    issues: flattenIssues([
      !fsSync.existsSync(manifestPath) && `desktop runtime manifest is missing: ${manifestPath}`,
      dotnetIssues,
      nodeIssues,
    ]),
  };

  report.ok = report.issues.length === 0;
  return report;
}
