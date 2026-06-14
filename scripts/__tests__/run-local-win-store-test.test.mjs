import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

const helpers = await import(new URL('../run-local-win-store-test.js', import.meta.url));

test('buildLaunchArguments enables optional local testing flags', () => {
  assert.deepEqual(helpers.buildLaunchArguments({
    purchaseSmokeTest: false,
    forceRendererAccessibility: false,
  }), []);

  assert.deepEqual(helpers.buildLaunchArguments({
    purchaseSmokeTest: true,
    forceRendererAccessibility: true,
  }), [
    '--desktop-subscription-purchase-smoke-test=1',
    '--force-renderer-accessibility',
  ]);
});

test('parseArgs reads local testing options', () => {
  assert.deepEqual(helpers.parseArgs([
    '--arch', 'x64',
    '--skip-build',
    '--purchase-smoke-test',
    '--force-renderer-accessibility',
  ]), {
    arch: 'x64',
    skipBuild: true,
    purchaseSmokeTest: true,
    forceRendererAccessibility: true,
  });
});

test('resolveDevRegistrationPaths points to the dev registration layout', () => {
  const paths = helpers.resolveDevRegistrationPaths('C:\\workspace\\hagicode-desktop');

  assert.equal(paths.appDirectory, path.join('C:\\workspace\\hagicode-desktop', 'build', 'msix-stage-dev-registration', 'app'));
  assert.equal(paths.manifestPath, path.join(paths.appDirectory, 'AppxManifest.xml'));
  assert.equal(paths.executablePath, path.join(paths.appDirectory, 'Hagicode Desktop.exe'));
});

test('resolveInvocation wraps Windows cmd entrypoints through cmd.exe', () => {
  const invocation = helpers.resolveInvocation('npm.cmd', ['run', 'build:all']);

  assert.equal(invocation.command.toLowerCase(), (process.env.ComSpec || 'cmd.exe').toLowerCase());
  assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(invocation.args[3], /^npm\.cmd run build:all$/);
});
