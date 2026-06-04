import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { resolveMsixManifestConfig } from './msix-config.js';

const PSF_REQUIRED_X64_FILES = [
  'PsfLauncher64.exe',
  'PsfRuntime64.dll',
  'ProcessLauncherFixup64.dll',
  'FileRedirectionFixup64.dll',
];

function isPsfEnabled() {
  return String(process.env.HAGICODE_ENABLE_PSF || '').trim().toLowerCase() === 'true';
}

function replaceTemplateTokens(template, replacements) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    if (!(key in replacements)) {
      throw new Error(`Missing PSF config replacement for ${key}`);
    }

    return replacements[key];
  });
}

function resolveAppExecutable(projectRoot, arch) {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const manifestConfig = resolveMsixManifestConfig({
    projectRoot,
    productName: packageJson.productName || packageJson.name,
    description: packageJson.description || packageJson.productName || packageJson.name,
    version: packageJson.version,
    arch,
  });

  return `app\\${manifestConfig.appExecutable}`;
}

export function resolvePsfBuildConfig(projectRoot, arch) {
  if (!isPsfEnabled()) {
    return {
      enabled: false,
    };
  }

  if (arch !== 'x64') {
    throw new Error('PSF injection is currently wired for Windows x64 only.');
  }

  const sourceDirectory = String(process.env.HAGICODE_PSF_DIR || '').trim();

  if (!sourceDirectory) {
    throw new Error('HAGICODE_PSF_DIR is required when HAGICODE_ENABLE_PSF=true.');
  }

  const templatePath = path.join(projectRoot, 'resources', 'psf', 'config.template.json');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`PSF config template is missing: ${templatePath}`);
  }

  for (const fileName of PSF_REQUIRED_X64_FILES) {
    const filePath = path.join(sourceDirectory, fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required PSF binary: ${filePath}`);
    }
  }

  return {
    enabled: true,
    sourceDirectory,
    templatePath,
    launcherName: 'PsfLauncher64.exe',
    runtimeDllName: 'PsfRuntime64.dll',
    processLauncherDllName: 'ProcessLauncherFixup64.dll',
    fileRedirectionDllName: 'FileRedirectionFixup64.dll',
    requiredFiles: [...PSF_REQUIRED_X64_FILES],
    appExecutable: resolveAppExecutable(projectRoot, arch),
    workingDirectory: 'app',
  };
}

async function renderPsfConfig(templatePath, config) {
  const template = await fsp.readFile(templatePath, 'utf8');

  return replaceTemplateTokens(template, {
    APP_EXECUTABLE: config.appExecutable,
    WORKING_DIRECTORY: config.workingDirectory,
    PROCESS_LAUNCHER_DLL: config.processLauncherDllName,
    FILE_REDIRECTION_DLL: config.fileRedirectionDllName,
  });
}

function resolvePackagedExecutable(outputPath, appExecutable) {
  return path.join(outputPath, ...appExecutable.split('\\'));
}

export async function injectPsfIntoPackagedOutputs(projectRoot, input) {
  if (input.platform !== 'win32') {
    return;
  }

  const config = resolvePsfBuildConfig(projectRoot, input.arch);

  if (!config.enabled) {
    return;
  }

  const renderedConfig = await renderPsfConfig(config.templatePath, config);

  for (const outputPath of input.outputPaths) {
    const packagedExecutable = resolvePackagedExecutable(outputPath, config.appExecutable);

    if (!fs.existsSync(packagedExecutable)) {
      throw new Error(`Packaged app executable was not found before PSF injection: ${packagedExecutable}`);
    }

    for (const fileName of config.requiredFiles) {
      await fsp.copyFile(
        path.join(config.sourceDirectory, fileName),
        path.join(outputPath, fileName),
      );
    }

    await fsp.writeFile(path.join(outputPath, 'config.json'), renderedConfig);
    console.log(`[psf] injected launcher into ${path.relative(projectRoot, outputPath)}`);
  }
}
