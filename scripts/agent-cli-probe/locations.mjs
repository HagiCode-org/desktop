// Lexical expected-location helpers. No realpath: symlinked bins are matched by the path the probe reports.

const SEMVER_PATTERN = /v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/;

/** Normalises separators, drops trailing separators, and lowercases on Windows. */
export function normalizeLexicalPath(value, platform) {
  let normalized = String(value).trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  while (normalized.length > 1 && normalized.endsWith('/') && !/^[A-Za-z]:\/$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Expands one expected-location entry.
 * `$HOME`, `%USERPROFILE%`, `%LOCALAPPDATA%`, `%APPDATA%`, `%ProgramData%` come from env.
 * `npm-global-bin` and `brew-bin` come from the context (resolved once per job).
 * Returns null when a token cannot be resolved.
 */
export function expandExpectedLocation(entry, { platform, env = {}, npmGlobalBin = null, brewBin = null }) {
  if (entry === 'npm-global-bin') return npmGlobalBin;
  if (entry === 'brew-bin') return brewBin;
  const replacements = {
    '$HOME': env.HOME ?? env.USERPROFILE,
    '%USERPROFILE%': env.USERPROFILE ?? env.HOME,
    '%LOCALAPPDATA%': env.LOCALAPPDATA,
    '%APPDATA%': env.APPDATA,
    '%ProgramData%': env.ProgramData ?? env.PROGRAMDATA,
  };
  let expanded = entry;
  for (const [token, value] of Object.entries(replacements)) {
    if (!expanded.includes(token)) continue;
    if (!value) return null;
    expanded = expanded.split(token).join(value);
  }
  return normalizeLexicalPath(expanded, platform);
}

/** Expands every entry of a case's expected locations for one OS. Unresolvable entries are dropped. */
export function expectedDirectories(row, osName, context) {
  const platform = context.platform;
  return (row.expectedLocation?.[osName] ?? [])
    .map((entry) => expandExpectedLocation(entry, context))
    .filter((value) => typeof value === 'string' && value.length > 0);
}

/** True when the resolved executable lies lexically inside one of the directories. */
export function isInsideExpectedLocation(resolvedPath, directories, platform) {
  if (!resolvedPath) return false;
  const candidate = normalizeLexicalPath(resolvedPath, platform);
  return directories.some((directory) => {
    const base = normalizeLexicalPath(directory, platform);
    return candidate === base || candidate.startsWith(`${base}/`);
  });
}

/** Extracts the first semver-shaped token from command output, or null. */
export function extractSemver(output) {
  const match = String(output ?? '').match(SEMVER_PATTERN);
  return match ? match[1] : null;
}

export function executableNamesFor(binName, platform) {
  return platform === 'win32'
    ? [`${binName}.cmd`, `${binName}.ps1`, `${binName}.exe`, binName]
    : [binName];
}

