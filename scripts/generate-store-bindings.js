import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, 'src', 'main', 'subscription', 'generated-js');
const codegenCommand = process.env.DYNWINRT_CODEGEN || 'npx dynwinrt-codegen';
const packagedCodegenCliPath = path.join(projectRoot, 'node_modules', '@microsoft', 'dynwinrt-codegen', 'cli.js');
const windowsSdkRoot = process.env.WindowsSdkDir
  ? path.resolve(process.env.WindowsSdkDir)
  : path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10');
const unionMetadataDir = path.join(windowsSdkRoot, 'UnionMetadata');
const interopWinmdPath = process.env.HAGICODE_WINDOWS_STORE_INTEROP_WINMD?.trim()
  ? path.resolve(process.env.HAGICODE_WINDOWS_STORE_INTEROP_WINMD.trim())
  : null;

function splitCommand(command) {
  return command.trim().split(/\s+/u);
}

function run(args) {
  const usePackagedCli = fs.existsSync(packagedCodegenCliPath);
  const [bin, ...binArgs] = usePackagedCli
    ? [process.execPath, packagedCodegenCliPath]
    : splitCommand(codegenCommand);
  const rendered = usePackagedCli
    ? `${process.execPath} ${packagedCodegenCliPath} ${args.join(' ')}`
    : `${codegenCommand} ${args.join(' ')}`;
  console.log(`> ${rendered}`);
  execFileSync(bin, [...binArgs, ...args], {
    stdio: 'inherit',
  });
}

function resolveWindowsWinmd() {
  const explicitWinmd = process.env.HAGICODE_WINDOWS_WINMD?.trim();
  if (explicitWinmd) {
    const resolved = path.resolve(explicitWinmd);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Configured Windows.winmd was not found: ${resolved}`);
    }

    return resolved;
  }

  if (!fs.existsSync(unionMetadataDir)) {
    throw new Error(`Windows SDK metadata directory was not found: ${unionMetadataDir}`);
  }

  const candidateDirectories = fs.readdirSync(unionMetadataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

  for (const directoryName of candidateDirectories) {
    const candidatePath = path.join(unionMetadataDir, directoryName, 'Windows.winmd');
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(`Unable to locate Windows.winmd under ${unionMetadataDir}`);
}

function generateStoreNamespace(windowsWinmdPath) {
  run([
    'generate',
    '--winmd', windowsWinmdPath,
    '--namespace', 'Windows.Services.Store',
    '--output', outputDir,
    '--lang', 'js',
  ]);
}

function generateInteropNamespace(windowsWinmdPath) {
  if (!interopWinmdPath) {
    console.log('[generate-store-bindings] Skipping WinRT.Interop bindings. Set HAGICODE_WINDOWS_STORE_INTEROP_WINMD to enable InitializeWithWindow generation.');
    return;
  }

  if (!fs.existsSync(interopWinmdPath)) {
    throw new Error(`Configured WinRT interop metadata was not found: ${interopWinmdPath}`);
  }

  try {
    run([
      'generate',
      '--winmd', interopWinmdPath,
      '--ref', windowsWinmdPath,
      '--namespace', 'WinRT.Interop',
      '--output', outputDir,
      '--lang', 'js',
    ]);
  } catch (error) {
    console.warn('[generate-store-bindings] WinRT.Interop binding generation failed; continuing without InitializeWithWindow support.', error);
  }
}

if (process.platform !== 'win32') {
  console.log(`[generate-store-bindings] Skipping on ${process.platform}; dynwinrt codegen only runs on Windows.`);
  process.exit(0);
}

const windowsWinmdPath = resolveWindowsWinmd();

if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

fs.mkdirSync(outputDir, { recursive: true });

console.log('[generate-store-bindings] Output directory:', outputDir);
console.log('[generate-store-bindings] Windows.winmd:', windowsWinmdPath);
console.log('[generate-store-bindings] Host:', os.hostname());

generateStoreNamespace(windowsWinmdPath);
generateInteropNamespace(windowsWinmdPath);

const generatedIndexPath = path.join(outputDir, 'index.js');
if (!fs.existsSync(generatedIndexPath)) {
  throw new Error(`dynwinrt code generation did not produce ${generatedIndexPath}`);
}

console.log('[generate-store-bindings] Done.');
