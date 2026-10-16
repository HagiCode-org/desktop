import { execFileSync } from 'node:child_process';

// Dependency-free on purpose: this file is copied unchanged into other repositories.
function stableVersion(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) throw new Error(`Expected a stable release tag vX.Y.Z, received: ${tag}`);
  return match.slice(1).join('.');
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Release note sections, in display order. A commit lands in the first section that matches its type. */
const SECTIONS = [
  { title: 'Breaking Changes', matches: (commit) => commit.breaking },
  { title: 'Features', matches: (commit) => commit.type === 'feat' },
  { title: 'Fixes', matches: (commit) => commit.type === 'fix' },
  { title: 'Performance', matches: (commit) => commit.type === 'perf' },
  { title: 'Documentation', matches: (commit) => commit.type === 'docs' },
  {
    title: 'Maintenance',
    matches: (commit) => ['build', 'ci', 'chore', 'refactor', 'revert', 'style', 'test'].includes(commit.type),
  },
  { title: 'Other Changes', matches: () => true },
];

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<description>\S.*)$/;

/** Parses one commit into a Conventional Commits shape; non-conventional subjects keep `type: null`. */
export function parseCommit({ sha, subject, body = '' }) {
  const match = HEADER.exec(subject.trim());
  const breakingFooter = /^BREAKING[ -]CHANGE:/m.test(body);
  if (!match) return { sha, type: null, scope: null, description: subject.trim(), breaking: breakingFooter };
  const { type, scope = null, bang, description } = match.groups;
  return { sha, type, scope, description: description.trim(), breaking: Boolean(bang) || breakingFooter };
}

/** Groups parsed commits by section, dropping empty sections and keeping git's newest-first order. */
export function groupCommits(commits) {
  const groups = SECTIONS.map(({ title }) => ({ title, commits: [] }));
  for (const commit of commits) {
    groups[SECTIONS.findIndex(({ matches }) => matches(commit))].commits.push(commit);
  }
  return groups.filter(({ commits: entries }) => entries.length > 0);
}

/**
 * Picks the next stable version: a breaking change bumps the major (the minor while still 0.x),
 * a feature bumps the minor, anything else bumps the patch.
 */
export function bumpVersion(lastVersion, commits) {
  const [major, minor, patch] = lastVersion.split('.').map(Number);
  if (commits.some((commit) => commit.breaking)) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (commits.some((commit) => commit.type === 'feat')) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Renders the release body. `repository` (owner/name) turns short SHAs into commit links. */
export function renderNotes(commits, repository) {
  if (commits.length === 0) return '## Changes\n\n_No changes yet._\n';
  const sections = groupCommits(commits).map(({ title, commits: entries }) => {
    const lines = entries.map((commit) => {
      const short = commit.sha.slice(0, 7);
      const reference = repository ? `[\`${short}\`](https://github.com/${repository}/commit/${commit.sha})` : `\`${short}\``;
      const scope = commit.scope ? `**${commit.scope}:** ` : '';
      return `- ${scope}${commit.description} (${reference})`;
    });
    return `### ${title}\n\n${lines.join('\n')}`;
  });
  return `## Changes\n\n${sections.join('\n\n')}\n`;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Newest stable `vX.Y.Z` tag reachable from HEAD, or null when nothing was released yet. */
export function lastStableTag() {
  const versions = git('tag', '--merged', 'HEAD', '--list', 'v*').split('\n').flatMap((tag) => {
    try {
      return [{ tag, version: stableVersion(tag) }];
    } catch {
      return [];
    }
  });
  versions.sort((a, b) => compareVersions(a.version, b.version));
  return versions.at(-1) ?? null;
}

/** Commits after `tag` up to HEAD, newest first, with merge commits left out. */
export function readCommits(tag) {
  const range = tag ? [`${tag}..HEAD`] : ['HEAD'];
  return git('log', '--no-merges', '--pretty=format:%H%x1f%s%x1f%b%x1e', ...range)
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body] = record.split('\x1f');
      return parseCommit({ sha, subject, body });
    });
}

function main() {
  const [command] = process.argv.slice(2);
  if (command !== 'version' && command !== 'notes') {
    throw new Error('Usage: node .github/scripts/release-notes.mjs version|notes');
  }
  const last = lastStableTag();
  const commits = readCommits(last?.tag);
  if (command === 'version') {
    const override = process.env.RELEASE_VERSION;
    process.stdout.write(override ? stableVersion(`v${override}`) : last ? bumpVersion(last.version, commits) : '0.1.0');
  } else {
    process.stdout.write(renderNotes(commits, process.env.GITHUB_REPOSITORY));
  }
}

if (process.argv[1]?.endsWith('release-notes.mjs')) main();
