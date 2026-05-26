import path from 'path';

export function resolveStagedDesktopRuntimeProgramHome(cwd = process.cwd()) {
  return path.join(cwd, 'resources');
}

export function resolveStagedDesktopRuntimeComponentRoot(componentId, options = {}) {
  if (componentId === 'code-server' || componentId === 'omniroute') {
    return resolveStagedDesktopRuntimeComponentContainerRoot(componentId, options);
  }

  return path.join(
    resolveStagedDesktopRuntimeComponentContainerRoot(componentId, options),
    ...(componentId === 'node' ? [] : ['current']),
  );
}

export function resolveStagedDesktopRuntimeComponentContainerRoot(componentId, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const programHome = resolveStagedDesktopRuntimeProgramHome(cwd);

  if (componentId === 'dotnet') {
    return path.join(programHome, 'components', 'dotnet', 'runtime', options.platform);
  }
  if (componentId === 'node') {
    return path.join(programHome, 'components', 'node', 'runtime');
  }
  if (componentId === 'code-server') {
    return path.join(programHome, 'components', 'bundled', 'code-server');
  }
  if (componentId === 'omniroute') {
    return path.join(programHome, 'components', 'bundled', 'omniroute');
  }

  throw new Error(`Unsupported Desktop runtime component: ${componentId}`);
}
