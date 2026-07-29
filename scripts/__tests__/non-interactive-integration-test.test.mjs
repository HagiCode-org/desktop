import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function importHarnessWithProjectRoot(projectRoot, cacheBuster) {
  const previousCwd = process.cwd();
  const previousSkipFlag = process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN;
  process.chdir(projectRoot);
  process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN = "1";
  try {
    const moduleUrl = new URL(
      `../non-interactive-integration-test.mjs?${cacheBuster}`,
      import.meta.url,
    );
    return await import(moduleUrl.href);
  } finally {
    if (previousSkipFlag === undefined) {
      delete process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN;
    } else {
      process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN = previousSkipFlag;
    }
    process.chdir(previousCwd);
  }
}

test("findZipArtifact discovers nested workflow artifacts under pkg/", async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "hagicode-non-interactive-test-"),
  );
  try {
    const nestedArtifactRoot = path.join(projectRoot, "pkg", "pkg");
    await fs.mkdir(nestedArtifactRoot, { recursive: true });
    const nestedZip = path.join(
      nestedArtifactRoot,
      "Hagicode Desktop 0.1.69-unpacked.zip",
    );
    await fs.writeFile(nestedZip, "zip placeholder", "utf8");

    const { findZipArtifact } = await importHarnessWithProjectRoot(
      projectRoot,
      `nested-zip=${Date.now()}`,
    );
    assert.equal(findZipArtifact(), nestedZip);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test("findAppImageArtifact discovers the current Linux release package under pkg/", async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "hagicode-non-interactive-test-"),
  );
  try {
    const nestedArtifactRoot = path.join(projectRoot, "pkg", "pkg");
    await fs.mkdir(nestedArtifactRoot, { recursive: true });
    const appImage = path.join(
      nestedArtifactRoot,
      "Hagicode Desktop-0.1.77.AppImage",
    );
    await fs.writeFile(appImage, "appimage placeholder", "utf8");

    const { findAppImageArtifact } = await importHarnessWithProjectRoot(
      projectRoot,
      `appimage=${Date.now()}`,
    );
    assert.equal(findAppImageArtifact(), appImage);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test("findDmgArtifact discovers the current macOS release package under pkg/", async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "hagicode-non-interactive-test-"),
  );
  try {
    const nestedArtifactRoot = path.join(projectRoot, "pkg", "pkg");
    await fs.mkdir(nestedArtifactRoot, { recursive: true });
    const x64Dmg = path.join(
      nestedArtifactRoot,
      "Hagicode Desktop-0.1.77-x64-unsigned.dmg",
    );
    const arm64Dmg = path.join(
      nestedArtifactRoot,
      "Hagicode Desktop-0.1.77-arm64-unsigned.dmg",
    );
    await fs.writeFile(x64Dmg, "x64 dmg placeholder", "utf8");
    await fs.writeFile(arm64Dmg, "arm64 dmg placeholder", "utf8");

    const { findDmgArtifact } = await importHarnessWithProjectRoot(
      projectRoot,
      `dmg=${Date.now()}`,
    );
    assert.equal(
      findDmgArtifact(),
      process.arch === "arm64" ? arm64Dmg : x64Dmg,
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test("findTarGzArtifact discovers nested workflow artifacts under pkg/", async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "hagicode-non-interactive-test-"),
  );
  try {
    const nestedArtifactRoot = path.join(projectRoot, "pkg", "pkg");
    await fs.mkdir(nestedArtifactRoot, { recursive: true });
    const nestedTarball = path.join(
      nestedArtifactRoot,
      "Hagicode-Desktop-0.1.69-linux-x64.tar.gz",
    );
    await fs.writeFile(nestedTarball, "tar placeholder", "utf8");

    const { findTarGzArtifact } = await importHarnessWithProjectRoot(
      projectRoot,
      `nested-tgz=${Date.now()}`,
    );
    assert.equal(findTarGzArtifact(), nestedTarball);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test("uses the current Desktop-managed package set for dependency install assertions", async () => {
  const { expectedInstalledPackageIds } = await importHarnessWithProjectRoot(
    process.cwd(),
    `expected-packages=${Date.now()}`,
  );

  assert.deepEqual(expectedInstalledPackageIds, [
    "pm2",
    "claude-code",
    "codex",
  ]);
});
