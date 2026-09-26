import path from 'path';

export function resolveStagedDesktopRuntimeProgramHome(cwd = process.cwd()) {
  return path.join(cwd, 'resources');
}

export function resolveStagedDesktopRuntimeComponentRoot(componentId, options = {}) {
  return path.join(
    resolveStagedDesktopRuntimeComponentContainerRoot(componentId, options),
    'current',
  );
}

export function resolveStagedDesktopRuntimeComponentContainerRoot(componentId, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const programHome = resolveStagedDesktopRuntimeProgramHome(cwd);

  if (componentId === 'dotnet') {
    return path.join(programHome, 'components', 'dotnet', 'runtime', options.platform);
  }

  throw new Error(`Unsupported Desktop runtime component: ${componentId}`);
}
