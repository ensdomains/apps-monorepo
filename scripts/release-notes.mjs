#!/usr/bin/env node
/**
 * Release notes for an app's prod release tag: the changes on main to that
 * app's directory, or to the shared code it ships with, since its previous
 * release tag, one line per merged PR (or direct commit).
 * Usage: node scripts/release-notes.mjs <tag> [<out dir>]
 *
 * Writes <out dir>/release-notes.md (full, for the GitHub release) and
 * <out dir>/release-message.txt (the same notes cut to whole lines within
 * 1000 bytes, Cloudflare's limit for a Worker version message). Default out
 * dir: the current directory.
 *
 * Release tags are <app>-YYYY-MM-DD, then <app>-YYYY-MM-DD.2, .3, ... the same
 * day; the previous release is the highest such tag for the same app below
 * <tag> that has a GitHub release. Apps and their directories are listed in
 * APP_DIRS; the shared paths every app ships with are in SHARED_PATHS.
 *
 * Needs the gh CLI, authenticated (GH_TOKEN in CI), to list the releases.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MESSAGE_MAX_BYTES = 1000;
const APP_DIRS = {
  portal: 'apps/portal',
  manager: 'apps/manager',
  'api-worker': 'workers/api-worker',
};
// Shared code every app ships with. Keep in sync with include_paths in
// .github/workflows/linear-releases.yml.
const SHARED_PATHS = ['packages', 'patches', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'];
const RELEASE_TAG = new RegExp(
  `^(${Object.keys(APP_DIRS).join('|')})-(\\d{4}-\\d{2}-\\d{2})(?:\\.([2-9]|[1-9]\\d+))?$`,
);

const [tag, outDir = '.'] = process.argv.slice(2);
const match = tag?.match(RELEASE_TAG);
if (!match) {
  console.error(
    `Usage: node scripts/release-notes.mjs <${Object.keys(APP_DIRS).join('|')}>-<YYYY-MM-DD[.COUNT]> [<out dir>]`,
  );
  process.exit(1);
}
const app = match[1];
const appDir = APP_DIRS[app];

// Commit bodies can run long; Node's default 1 MB output cap is too small.
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

// Sort key: the date, then the day's counter (a bare date is release 1).
const releaseKey = t => {
  const [, , day, count] = t.match(RELEASE_TAG);
  return `${day}.${String(count ?? 1).padStart(6, '0')}`;
};

// The release workflows create a GitHub release only once the deploy
// succeeds, so a tag without one (failed, or its waiting run replaced) never
// reached prod: its changes belong in this release's notes.
const released = new Set(
  execFileSync('gh', ['api', '--paginate', 'repos/{owner}/{repo}/releases', '--jq', '.[] | select(.draft | not) | .tag_name'], {
    encoding: 'utf8',
  }).split('\n'),
);

const previous = git('tag', '--list')
  .split('\n')
  .filter(t => t.match(RELEASE_TAG)?.[1] === app && releaseKey(t) < releaseKey(tag) && released.has(t))
  .sort((a, b) => releaseKey(a).localeCompare(releaseKey(b)))
  .pop();

// First-parent history of main: one entry per merged PR. GitHub's merge
// commits read "Merge pull request #N from <branch>", with the PR title as
// the first line of the body; a squash merge or direct commit is its subject.
// Only entries that touch the app's directory or SHARED_PATHS count. A first
// release has nothing to compare with, and listing the app's whole history
// would not fit a GitHub release, so it lists none.
const SEP = '\x1f';
const changes = (
  previous
    ? git('log', '--first-parent', `--format=%h${SEP}%s${SEP}%b%x1e`, `${previous}..${tag}`, '--', appDir, ...SHARED_PATHS)
    : ''
)
  .split('\x1e')
  .map(entry => entry.trim())
  .filter(Boolean)
  .map(entry => {
    const [sha, subject, body] = entry.split(SEP);
    const pr = subject.match(/^Merge pull request #(\d+) from /);
    if (pr) {
      const title = body.split('\n').map(l => l.trim()).find(Boolean) ?? subject;
      return `- ${title} (#${pr[1]})`;
    }
    return `- ${subject} (${sha})`;
  });

const header = previous
  ? `Release ${tag}: ${changes.length} ${app} change${changes.length === 1 ? '' : 's'} since ${previous}`
  : `Release ${tag}: first release`;
const lines = !previous
  ? ['- No previous release to compare with.']
  : changes.length
    ? changes
    : [`- No changes to ${appDir} or shared code since the previous release (redeploy).`];

const repo = process.env.GITHUB_REPOSITORY;
const compare = repo && previous
  ? `\n\nFull diff: https://github.com/${repo}/compare/${previous}...${tag}`
  : '';
const notes = `${header}\n\n${lines.join('\n')}${compare}\n`;

// The version message: as many whole lines as fit, then how many were left out.
const bytes = s => Buffer.byteLength(s, 'utf8');
let message = header;
let included = 0;
for (const line of lines) {
  const rest = lines.length - included - 1;
  const more = rest ? `\n…and ${rest} more` : '';
  if (bytes(`${message}\n${line}${more}`) > MESSAGE_MAX_BYTES) break;
  message += `\n${line}`;
  included++;
}
if (included < lines.length) message += `\n…and ${lines.length - included} more`;

writeFileSync(resolve(outDir, 'release-notes.md'), notes);
writeFileSync(resolve(outDir, 'release-message.txt'), message);
console.log(notes);
