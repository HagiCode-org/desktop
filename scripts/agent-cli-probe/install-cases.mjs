// Single source of truth for Agent CLI probe integration cases.
// Plain ESM with no TypeScript imports, so the planner and the harness unit
// tests run under plain `node --test`. The coverage guard
// (src/main/__tests__/agent-cli-probe-coverage.test.ts) checks this registry
// against the real catalog and managed package definitions.

export const OPERATING_SYSTEMS = Object.freeze(['linux', 'macos', 'windows']);
export const RUNNER_IMAGES = Object.freeze({
  linux: 'ubuntu-latest',
  macos: 'macos-latest',
  windows: 'windows-latest',
});
export const TIERS = Object.freeze(['core', 'extended']);
export const INSTALL_KINDS = Object.freeze(['shell', 'powershell', 'cmd', 'managed-npm', 'managed-external']);
export const RESULT_CLASSES = Object.freeze(['pass', 'probe-defect', 'env-failure', 'skipped', 'xfail']);

/** Mirror of `desktopAgentCliCatalog` ids. The coverage guard fails if this list drifts. */
export const catalogCliIds = Object.freeze([
  'claude-code', 'codex', 'pi', 'reasonix', 'copilot', 'opencode', 'qoder',
  'kiro-cli', 'kimi', 'gemini', 'deepagents', 'codebuddy', 'hermes',
]);

export const VERIFIED_ON = '2026-10-15';

/** Linux Homebrew is not on PATH until shellenv runs. The prefix is a no-op where it does not exist. */
const BREW_ENV = '[ -x /home/linuxbrew/.linuxbrew/bin/brew ] && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"; ';

const ANTHROPIC_NATIVE = 'https://code.claude.com/docs/en/setup';
const ANTHROPIC_APT = 'https://code.claude.com/docs/en/setup';
const COPILOT_DOCS = 'https://docs.github.com/copilot/how-tos/copilot-cli';
const OPENCODE_DOCS = 'https://github.com/anomalyco/opencode';
const GEMINI_DOCS = 'https://www.geminicli.com/docs/get-started/installation';
const CODEX_DOCS = 'https://github.com/openai/codex';
const KIRO_DOCS = 'https://kiro.dev/docs/cli/installation/';
const KIMI_DOCS = 'https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started';
const DEEPAGENTS_DOCS = 'https://docs.langchain.com/oss/python/deepagents/cli/overview';
const HERMES_DOCS = 'https://hermes-agent.nousresearch.com/docs/getting-started/installation/';

/**
 * Row shape:
 * {
 *   id, cliId, method, tier, os[], container, install: { kind, command? },
 *   managedPackageId, probeSurfaces: ['A'] | ['B'] | ['A','B'],
 *   expectedLocation: { linux?: [], macos?: [], windows?: [] },
 *   runnerPreinstalled: [], knownIssue: null | { reason, trackedBy },
 *   timeoutMinutes, verification, verifiedOn, source
 * }
 * Expected-location tokens: `$HOME`, `%USERPROFILE%`, `%LOCALAPPDATA%`, `%APPDATA%`,
 * `npm-global-bin` (npm prefix -g, plus `/bin` on POSIX) and `brew-bin` (brew --prefix, plus `/bin`).
 */
export const installCases = [
  // ---- claude-code -------------------------------------------------------
  {
    id: 'claude-code/npm', cliId: 'claude-code', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'claude-code', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: ANTHROPIC_NATIVE,
  },
  {
    id: 'claude-code/native-sh', cliId: 'claude-code', method: 'native-sh', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: 'curl -fsSL https://claude.ai/install.sh | bash' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.local/bin'], macos: ['$HOME/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'official', verifiedOn: VERIFIED_ON, source: ANTHROPIC_NATIVE,
  },
  {
    id: 'claude-code/native-powershell', cliId: 'claude-code', method: 'native-powershell', tier: 'core', os: ['windows'],
    container: null, install: { kind: 'powershell', command: 'irm https://claude.ai/install.ps1 | iex' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { windows: ['%USERPROFILE%/.local/bin'] },
    runnerPreinstalled: [],
    knownIssue: {
      reason: 'Observed on hosted Windows (run 38826636715): the native installer places claude.exe in %USERPROFILE%\\.local\\bin without adding it to the persisted PATH, so a new terminal cannot find it. The vendor docs say to fix PATH manually.',
      trackedBy: 'https://github.com/HagiCode-org/desktop/actions/runs/38826636715',
    },
    timeoutMinutes: 10,
    verification: 'official', verifiedOn: VERIFIED_ON, source: ANTHROPIC_NATIVE,
  },
  {
    id: 'claude-code/homebrew-cask', cliId: 'claude-code', method: 'homebrew-cask', tier: 'core', os: ['macos'],
    container: null, install: { kind: 'shell', command: BREW_ENV + 'brew install --cask claude-code' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { macos: ['brew-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: ANTHROPIC_NATIVE,
  },
  {
    id: 'claude-code/homebrew-cask-latest', cliId: 'claude-code', method: 'homebrew-cask-latest', tier: 'extended', os: ['macos'],
    container: null, install: { kind: 'shell', command: BREW_ENV + 'brew install --cask claude-code@latest' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { macos: ['brew-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: ANTHROPIC_NATIVE,
  },
  {
    id: 'claude-code/apt', cliId: 'claude-code', method: 'apt', tier: 'core', os: ['linux'],
    container: null,
    install: {
      kind: 'shell',
      command: 'sudo install -d -m 0755 /etc/apt/keyrings && '
        + 'sudo curl -fsSL https://downloads.claude.ai/keys/claude-code.asc -o /etc/apt/keyrings/claude-code.asc && '
        + 'echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/stable stable main" | sudo tee /etc/apt/sources.list.d/claude-code.list >/dev/null && '
        + 'sudo apt-get update && sudo apt-get install -y claude-code',
    },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['/usr/bin', '/usr/local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: ANTHROPIC_APT,
    notes: 'Repository URL and key path are from the vendor docs; confirm on the first spike run (task 1.1).',
  },
  {
    id: 'claude-code/dnf', cliId: 'claude-code', method: 'dnf', tier: 'extended', os: ['linux'],
    container: 'fedora:42', install: { kind: 'shell', command: 'dnf install -y claude-code' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['/usr/bin', '/usr/local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: ANTHROPIC_NATIVE,
    notes: 'Repository file must be added before dnf install; container case only.',
  },
  {
    id: 'claude-code/apk', cliId: 'claude-code', method: 'apk', tier: 'extended', os: ['linux'],
    container: 'alpine:3.22', install: { kind: 'shell', command: 'apk add claude-code' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['/usr/bin', '/usr/local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: ANTHROPIC_NATIVE,
    notes: 'Repository key and line must be added before apk add; container case only.',
  },

  // ---- codex -------------------------------------------------------------
  {
    id: 'codex/npm', cliId: 'codex', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'codex', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: CODEX_DOCS,
  },
  {
    id: 'codex/homebrew-cask', cliId: 'codex', method: 'homebrew-cask', tier: 'core', os: ['macos'],
    container: null, install: { kind: 'shell', command: BREW_ENV + 'brew install --cask codex' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { macos: ['brew-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'secondary', verifiedOn: VERIFIED_ON, source: CODEX_DOCS,
  },
  {
    id: 'codex/install-script', cliId: 'codex', method: 'install-script', tier: 'extended', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.local/bin', '$HOME/.codex/bin'], macos: ['$HOME/.local/bin', '$HOME/.codex/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'secondary', verifiedOn: VERIFIED_ON, source: CODEX_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run.',
  },

  // ---- pi (catalog) and oh-my-pi (managed external installer) -----------
  {
    id: 'pi/npm', cliId: 'pi', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'pi', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: 'src/shared/npm-managed-packages.ts',
  },
  {
    id: 'oh-my-pi/external-installer', cliId: 'pi', method: 'external-installer', tier: 'extended', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-external' }, managedPackageId: 'oh-my-pi', probeSurfaces: ['B'],
    expectedLocation: { linux: ['$HOME/.local/bin', '$HOME/.omp/bin'], macos: ['$HOME/.local/bin', '$HOME/.omp/bin'], windows: ['%USERPROFILE%/.omp/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: 'src/shared/npm-managed-packages.ts',
    notes: 'Surface B only. Oh My Pi is not a catalog CLI. Installer locations are not pinned; confirm on the first run.',
  },

  // ---- reasonix, codebuddy, qoder, opencode, gemini, copilot ------------
  {
    id: 'reasonix/npm', cliId: 'reasonix', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'reasonix', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: 'src/shared/npm-managed-packages.ts',
  },
  {
    id: 'codebuddy/npm', cliId: 'codebuddy', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'codebuddy', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: 'src/shared/npm-managed-packages.ts',
  },
  {
    id: 'qoder/npm', cliId: 'qoder', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'qoder', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: 'src/shared/npm-managed-packages.ts',
  },
  {
    id: 'opencode/npm', cliId: 'opencode', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'opencode', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: 'src/shared/npm-managed-packages.ts',
  },
  {
    id: 'opencode/install-script', cliId: 'opencode', method: 'install-script', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: 'curl -fsSL https://opencode.ai/install | bash' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.opencode/bin', '$HOME/bin', '$HOME/.local/bin'], macos: ['$HOME/.opencode/bin', '$HOME/bin', '$HOME/.local/bin'] },
    runnerPreinstalled: [],
    knownIssue: {
      reason: 'Observed on hosted Linux: the oracle finds the binary in the install directory, but the production probe (login-shell command -v) reports it missing. The installer does not add that directory to PATH for the probe environment.',
      trackedBy: 'https://github.com/HagiCode-org/desktop/actions/runs/38823855466',
    },
    timeoutMinutes: 10,
    verification: 'secondary', verifiedOn: VERIFIED_ON, source: OPENCODE_DOCS,
  },
  {
    id: 'opencode/homebrew', cliId: 'opencode', method: 'homebrew', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: BREW_ENV + 'brew install anomalyco/tap/opencode' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['brew-bin'], macos: ['brew-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'secondary', verifiedOn: VERIFIED_ON, source: OPENCODE_DOCS,
    notes: 'Tap name taken from the README. Homebrew is preinstalled on the Linux and macOS images but needs shellenv on PATH.',
  },
  {
    id: 'opencode/chocolatey', cliId: 'opencode', method: 'chocolatey', tier: 'extended', os: ['windows'],
    container: null, install: { kind: 'cmd', command: 'choco install opencode -y' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { windows: ['%ProgramData%/chocolatey/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'secondary', verifiedOn: VERIFIED_ON, source: OPENCODE_DOCS,
    notes: 'Chocolatey 2.7.4 is listed on the Windows2025 runner image. Choco package freshness is unverified.',
  },
  {
    id: 'gemini/npm', cliId: 'gemini', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'gemini', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: GEMINI_DOCS,
  },
  {
    id: 'gemini/homebrew', cliId: 'gemini', method: 'homebrew', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: BREW_ENV + 'brew install gemini-cli' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['brew-bin'], macos: ['brew-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: GEMINI_DOCS,
  },
  {
    id: 'copilot/npm', cliId: 'copilot', method: 'npm', tier: 'core', os: ['linux', 'macos', 'windows'],
    container: null, install: { kind: 'managed-npm' }, managedPackageId: 'github-copilot', probeSurfaces: ['A', 'B'],
    expectedLocation: { linux: ['npm-global-bin'], macos: ['npm-global-bin'], windows: ['npm-global-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'managed', verifiedOn: VERIFIED_ON, source: COPILOT_DOCS,
  },
  {
    id: 'copilot/install-script', cliId: 'copilot', method: 'install-script', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: 'curl -fsSL https://gh.io/copilot-install | bash' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.local/bin', '/usr/local/bin'], macos: ['$HOME/.local/bin', '/usr/local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'official', verifiedOn: VERIFIED_ON, source: COPILOT_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run.',
  },
  {
    id: 'copilot/homebrew', cliId: 'copilot', method: 'homebrew', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: BREW_ENV + 'brew install copilot-cli' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['brew-bin'], macos: ['brew-bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: COPILOT_DOCS,
    notes: 'Docs also show a cask form; the formula form is the one recorded here. Confirm in task 1.1.',
  },

  // ---- CLIs without a Desktop-managed npm package ------------------------
  {
    id: 'kiro-cli/install-script', cliId: 'kiro-cli', method: 'install-script', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: 'curl -fsSL https://cli.kiro.dev/install | bash' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.local/bin'], macos: ['$HOME/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'official', verifiedOn: VERIFIED_ON, source: KIRO_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run.',
  },
  {
    id: 'kiro-cli/install-powershell', cliId: 'kiro-cli', method: 'install-powershell', tier: 'core', os: ['windows'],
    container: null, install: { kind: 'powershell', command: "irm 'https://cli.kiro.dev/install.ps1' | iex" },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { windows: ['%USERPROFILE%/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'official', verifiedOn: VERIFIED_ON, source: KIRO_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run.',
  },
  {
    id: 'kimi/install-script', cliId: 'kimi', method: 'install-script', tier: 'core', os: ['linux', 'macos'],
    container: null, install: { kind: 'shell', command: 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.local/bin'], macos: ['$HOME/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'official', verifiedOn: VERIFIED_ON, source: KIMI_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run.',
  },
  {
    id: 'kimi/install-powershell', cliId: 'kimi', method: 'install-powershell', tier: 'core', os: ['windows'],
    container: null, install: { kind: 'powershell', command: 'irm https://code.kimi.com/kimi-code/install.ps1 | iex' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { windows: ['%USERPROFILE%/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 10,
    verification: 'official', verifiedOn: VERIFIED_ON, source: KIMI_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run. Git for Windows is required before first launch.',
  },
  {
    id: 'deepagents/install-script', cliId: 'deepagents', method: 'install-script', tier: 'core', os: ['linux', 'macos'],
    container: null,
    install: { kind: 'shell', command: 'curl -LsSf https://raw.githubusercontent.com/langchain-ai/deepagents/main/libs/cli/scripts/install.sh | bash' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.local/bin'], macos: ['$HOME/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: DEEPAGENTS_DOCS,
    notes: 'Install location is not pinned by the source; the uv tool bin default is assumed. Confirm on the first run.',
  },
  {
    id: 'hermes/install-script', cliId: 'hermes', method: 'install-script', tier: 'core', os: ['linux', 'macos'],
    container: null,
    install: { kind: 'shell', command: 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { linux: ['$HOME/.local/bin'], macos: ['$HOME/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: HERMES_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run.',
  },
  {
    id: 'hermes/install-powershell', cliId: 'hermes', method: 'install-powershell', tier: 'core', os: ['windows'],
    container: null, install: { kind: 'powershell', command: 'irm https://hermes-agent.nousresearch.com/install.ps1 | iex' },
    managedPackageId: null, probeSurfaces: ['A'],
    expectedLocation: { windows: ['%USERPROFILE%/.local/bin'] },
    runnerPreinstalled: [], knownIssue: null, timeoutMinutes: 15,
    verification: 'official', verifiedOn: VERIFIED_ON, source: HERMES_DOCS,
    notes: 'Install location is not pinned by the source; confirm on the first run.',
  },
];

/**
 * Recorded exclusions. Each one needs a method, a reason and a source (or a note that no source applies).
 * A CLI or documented method must have a case or an exclusion.
 */
export const exclusions = [
  { cliId: 'claude-code', method: 'winget', reason: 'WinGet is not listed in the Windows2025 runner-images inventory (checked 2026-10-15), so the hosted runner cannot provide the prerequisite.', source: 'https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md', verifiedOn: VERIFIED_ON },
  { cliId: 'claude-code', method: 'channel-stable', reason: 'Same install location and binary as the default channel, so no separate probe contract. Pinned-version channels are not separate methods.', source: ANTHROPIC_NATIVE, verifiedOn: VERIFIED_ON },
  { cliId: 'claude-code', method: 'native-cmd', reason: 'Legacy Windows CMD install channel. Product decision: older Windows install paths are not supported, so this case is out of scope for the probe matrix.', source: ANTHROPIC_NATIVE, verifiedOn: VERIFIED_ON },
  { cliId: 'claude-code', method: 'wsl', reason: 'WSL is not a native Windows runner. Out of scope (design non-goals).', source: null, verifiedOn: VERIFIED_ON },
  { cliId: 'codex', method: 'release-binary-archive', reason: 'Placement of release archives is chosen by the user, so there is no fixed expected location to assert.', source: CODEX_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'copilot', method: 'winget', reason: 'WinGet is not listed in the Windows2025 runner-images inventory (checked 2026-10-15), so the hosted runner cannot provide the prerequisite.', source: 'https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md', verifiedOn: VERIFIED_ON },
  { cliId: 'opencode', method: 'scoop', reason: 'Scoop was not verified against the runner-images inventory. Excluded until verified.', source: OPENCODE_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'gemini', method: 'npx', reason: 'npx runs the CLI without installing it, so there is no installation to detect.', source: GEMINI_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'gemini', method: 'macports', reason: 'MacPorts is not preinstalled on the hosted macOS runner, so no hosted-runner prerequisite exists.', source: GEMINI_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'gemini', method: 'conda', reason: 'Restricted-environment route through Anaconda. Out of scope for a hosted runner.', source: GEMINI_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'kiro-cli', method: 'homebrew', reason: 'Official docs say the Kiro CLI binary is not available through Homebrew and is not supported.', source: KIRO_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'kimi', method: 'npm', reason: 'Two Moonshot products install a binary called kimi. The npm package name is easy to confuse, so the official script is the only recorded method.', source: KIMI_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'deepagents', method: 'install-powershell', reason: 'No verified native Windows installer in the vendor docs reviewed. The uv and pip routes need a Python toolchain setup. Revisit in a follow-up.', source: DEEPAGENTS_DOCS, verifiedOn: VERIFIED_ON },
  { cliId: 'codebuddy', method: 'other', reason: 'No other install method was verified. The npm case covers the Desktop-managed package.', source: 'src/shared/npm-managed-packages.ts', verifiedOn: VERIFIED_ON },
  { cliId: 'qoder', method: 'other', reason: 'No other install method was verified in task 1.2. The npm case covers the Desktop-managed package.', source: 'src/shared/npm-managed-packages.ts', verifiedOn: VERIFIED_ON },
  { cliId: 'reasonix', method: 'other', reason: 'No other install method is documented. The npm case covers the Desktop-managed package.', source: 'src/shared/npm-managed-packages.ts', verifiedOn: VERIFIED_ON },
  { cliId: 'pi', method: 'other', reason: 'No other install method is documented. The npm case and the Oh My Pi external installer cover pi.', source: 'src/shared/npm-managed-packages.ts', verifiedOn: VERIFIED_ON },
];

/** Methods the vendors document for CLIs with several of them. The guard checks each has a case or an exclusion. */
export const documentedMethods = Object.freeze({
  'claude-code': ['npm', 'native-sh', 'native-powershell', 'native-cmd', 'homebrew-cask', 'homebrew-cask-latest', 'winget', 'apt', 'dnf', 'apk', 'channel-stable', 'wsl'],
  codex: ['npm', 'homebrew-cask', 'install-script', 'release-binary-archive'],
  gemini: ['npm', 'homebrew', 'npx', 'macports', 'conda'],
  copilot: ['npm', 'winget', 'homebrew', 'install-script'],
  opencode: ['npm', 'install-script', 'homebrew', 'scoop', 'chocolatey'],
  'kiro-cli': ['install-script', 'install-powershell', 'homebrew'],
  kimi: ['install-script', 'install-powershell', 'npm'],
  deepagents: ['install-script', 'install-powershell'],
  hermes: ['install-script', 'install-powershell'],
});

/** Lists CLIs whose case is not a single method (used by the planner's job names). */
export function methodsFor(cliId) {
  return installCases.filter((row) => row.cliId === cliId).map((row) => row.method);
}

/**
 * Validates the registry shape and references. Returns a list of problem strings (empty when valid).
 * @param {{cases?: object[], exclusions?: object[], catalogIds?: string[], managedPackageIds?: string[]}} input
 */
export function validateRegistry({
  cases = installCases,
  exclusionRows = exclusions,
  catalogIds = catalogCliIds,
  managedPackageIds = [],
} = {}) {
  const problems = [];
  const seen = new Set();
  const cliIds = new Set(catalogIds);
  const managed = new Set(managedPackageIds);

  for (const row of cases) {
    const label = row?.id ?? '<missing id>';
    if (typeof row?.id !== 'string' || row.id.length === 0) {
      problems.push(`${label}: id is required`);
      continue;
    }
    if (seen.has(row.id)) problems.push(`${row.id}: duplicate case id`);
    seen.add(row.id);
    if (!cliIds.has(row.cliId)) problems.push(`${row.id}: unknown CLI id "${row.cliId}"`);
    if (!TIERS.includes(row.tier)) problems.push(`${row.id}: unknown tier "${row.tier}"`);
    if (!Array.isArray(row.os) || row.os.length === 0) problems.push(`${row.id}: os must be a non-empty list`);
    for (const os of row.os ?? []) {
      if (!OPERATING_SYSTEMS.includes(os)) problems.push(`${row.id}: unknown operating system "${os}"`);
      if (!row.expectedLocation?.[os]?.length) problems.push(`${row.id}: expectedLocation has no entry for ${os}`);
    }
    if (row.container && (row.os ?? []).some((os) => os !== 'linux')) problems.push(`${row.id}: container cases must be linux only`);
    if (!INSTALL_KINDS.includes(row.install?.kind)) problems.push(`${row.id}: unknown install kind "${row.install?.kind}"`);
    if (row.install?.kind === 'managed-npm' && !row.managedPackageId) problems.push(`${row.id}: managed-npm needs managedPackageId`);
    if (row.managedPackageId && managedPackageIds.length > 0 && !managed.has(row.managedPackageId)) {
      problems.push(`${row.id}: unknown managedPackageId "${row.managedPackageId}"`);
    }
    if (!Array.isArray(row.probeSurfaces) || row.probeSurfaces.length === 0) problems.push(`${row.id}: probeSurfaces required`);
    if (row.knownIssue && (!row.knownIssue.reason || !row.knownIssue.trackedBy)) {
      problems.push(`${row.id}: knownIssue needs reason and trackedBy`);
    }
    if (!row.verifiedOn || !row.source) problems.push(`${row.id}: verifiedOn and source are required`);
  }

  for (const row of exclusionRows) {
    const label = `exclusion ${row.cliId}/${row.method}`;
    if (!cliIds.has(row.cliId)) problems.push(`${label}: unknown CLI id`);
    if (!row.reason || !row.reason.trim()) problems.push(`${label}: reason is required`);
  }

  return problems;
}
