const fs = require('node:fs');
const path = require('node:path');

function resolvePaths(context) {
  const appPath = path.join(context.appOutDir, 'Hagicode Desktop.app');
  const toolchainPath = path.join(appPath, 'Contents', 'Resources', 'extra', 'portable-fixed', 'toolchain');
  const stashRoot = path.join(context.outDir, '.hagicode-signing-stash', path.basename(context.appOutDir));
  const stashPath = path.join(stashRoot, 'toolchain');
  return { toolchainPath, stashRoot, stashPath };
}

function shouldHandle(context) {
  return context.electronPlatformName === 'darwin';
}

exports.afterPack = async function afterPack(context) {
  if (!shouldHandle(context)) {
    return;
  }

  const { toolchainPath, stashRoot, stashPath } = resolvePaths(context);
  if (!fs.existsSync(toolchainPath)) {
    return;
  }

  fs.rmSync(stashPath, { recursive: true, force: true });
  fs.mkdirSync(stashRoot, { recursive: true });
  fs.renameSync(toolchainPath, stashPath);
  console.log(`[macos-toolchain-signing-hook] Stashed bundled toolchain before signing: ${stashPath}`);
};

exports.afterSign = async function afterSign(context) {
  if (!shouldHandle(context)) {
    return;
  }

  const { toolchainPath, stashRoot, stashPath } = resolvePaths(context);
  if (!fs.existsSync(stashPath)) {
    return;
  }

  fs.rmSync(toolchainPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(toolchainPath), { recursive: true });
  fs.renameSync(stashPath, toolchainPath);
  fs.rmSync(stashRoot, { recursive: true, force: true });
  console.log(`[macos-toolchain-signing-hook] Restored bundled toolchain after signing: ${toolchainPath}`);
};
