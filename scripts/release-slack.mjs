#!/usr/bin/env node
/**
 * Posts a prod release's outcome to Slack: the changes it shipped, or the job
 * it failed at. Runs as the last job of each release workflow, after the
 * others whatever their result, so a rerun of a failed job posts again.
 * Usage: node scripts/release-slack.mjs [<notes dir>]
 *
 * Reads <notes dir>/release-notes.json from scripts/release-notes.mjs (it is
 * missing when the tag check failed). NEEDS is the workflow's toJSON(needs):
 * each job's result, and for Explorer the Swarm job's root and Safe outputs.
 * Posts to SLACK_WEBHOOK_URL; without it, or with DRY_RUN=1, prints the
 * message instead, so a repo without the secret still releases cleanly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPS = {
  manager: 'Manager',
  portal: 'Explorer',
  'api-worker': 'API Worker',
};
const JOBS = {
  prepare: 'tag check',
  cloudflare: 'Cloudflare deploy',
  swarm: 'Swarm upload',
  release: 'GitHub release',
};
// Linear team keys that get linked; a bare prefix would also catch EIP-2612.
const LINEAR_TICKET = /\b(?:WEB|FET)-\d+\b/g;
// Slack rejects a section over 3000 characters.
const SECTION_MAX = 2900;
const MAX_CHANGES = 40;

const [notesDir = '.'] = process.argv.slice(2);
const {
  TAG: tag,
  NEEDS: needsJson = '{}',
  SLACK_WEBHOOK_URL: webhookUrl,
  DRY_RUN: dryRun,
  GITHUB_SERVER_URL: server = 'https://github.com',
  GITHUB_REPOSITORY: repo,
  GITHUB_RUN_ID: runId,
  GITHUB_RUN_ATTEMPT: attempt = '1',
  GITHUB_ACTOR: actor,
  GITHUB_SHA: sha,
} = process.env;

const notesPath = resolve(notesDir, 'release-notes.json');
const notes = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : null;
const needs = JSON.parse(needsJson);
const app = tag?.match(new RegExp(`^(${Object.keys(APPS).join('|')})-`))?.[1];
const name = APPS[app] ?? tag;

const repoUrl = `${server}/${repo}`;
const runUrl = `${repoUrl}/actions/runs/${runId}${attempt === '1' ? '' : `/attempts/${attempt}`}`;
const releaseUrl = `${repoUrl}/releases/tag/${tag}`;

// Titles are contributor-controlled; escape Slack's control characters so a
// title containing e.g. <!channel> can't ping anyone.
const escapeSlack = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const linkTickets = s => s.replace(LINEAR_TICKET, id => `<https://linear.app/enslabs/issue/${id}|${id}>`);
const changeLine = c =>
  `• ${linkTickets(escapeSlack(c.title))} ${
    c.pr ? `<${repoUrl}/pull/${c.pr}|#${c.pr}>` : `<${repoUrl}/commit/${c.sha}|${c.sha}>`
  }`;

const results = Object.entries(needs).map(([job, { result }]) => ({ job: JOBS[job] ?? job, result }));
const failed = results.filter(r => r.result === 'failure');
const succeeded = results.filter(r => r.result === 'success');
const isReleased = results.length > 0 && succeeded.length === results.length;

const changes = notes?.changes ?? [];
const shown = changes.slice(0, MAX_CHANGES).map(changeLine);
if (changes.length > shown.length) {
  shown.push(`…and ${changes.length - shown.length} more in the <${releaseUrl}|GitHub release>`);
}

// Whole lines per section, each within Slack's limit.
const sections = shown.reduce((acc, line) => {
  const last = acc.at(-1);
  if (last && last.length + line.length + 1 <= SECTION_MAX) acc[acc.length - 1] = `${last}\n${line}`;
  else acc.push(line);
  return acc;
}, []);

const summary = !notes
  ? `\`${tag}\``
  : !notes.previous
    ? `<${releaseUrl}|${tag}>: first release`
    : `${isReleased ? `<${releaseUrl}|${tag}>` : `\`${tag}\``}: ${changes.length} change${
        changes.length === 1 ? '' : 's'
      } since \`${notes.previous}\``;

const outcome = isReleased
  ? null
  : failed.length
    ? `Failed at *${failed.map(r => r.job).join(', ')}*.${
        succeeded.length ? ` Done: ${succeeded.map(r => r.job).join(', ')}.` : ''
      } <${runUrl}|Open the run>.`
    : `Did not finish (${results.map(r => `${r.job}: ${r.result}`).join(', ')}). <${runUrl}|Open the run>.`;

// Explorer: ens.eth only moves once the Safe executes the proposed update.
const { root, safe } = needs.swarm?.outputs ?? {};
const ensEth =
  app === 'portal' && needs.swarm?.result === 'success'
    ? `:hourglass_flowing_sand: ens.eth keeps serving the previous build until the Safe executes the contenthash update${
        safe ? ` (<https://app.safe.global/transactions/queue?safe=eth:${safe}|Safe queue>)` : ''
      }.${root ? ` Swarm root \`${root}\`.` : ''}`
    : null;

const footer = [
  actor && `Tagged by <${server}/${actor}|${actor}>`,
  sha && `<${repoUrl}/commit/${sha}|${sha.slice(0, 9)}>`,
  notes?.compareUrl && `<${notes.compareUrl}|Full diff>`,
  `<${runUrl}|Workflow run${attempt === '1' ? '' : ` (attempt ${attempt})`}>`,
]
  .filter(Boolean)
  .join(' · ');

const title = isReleased ? `:rocket: ${name} released to mainnet` : `:x: ${name} release failed`;
const section = text => ({ type: 'section', text: { type: 'mrkdwn', text } });
const blocks = [
  { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
  section([summary, outcome].filter(Boolean).join('\n')),
  ...sections.map(section),
  ...(ensEth ? [section(ensEth)] : []),
  { type: 'context', elements: [{ type: 'mrkdwn', text: footer }] },
];
const message = { text: `${title.replace(/^:\w+: /, '')}: ${tag}`, blocks, unfurl_links: false };

if (!webhookUrl || dryRun === '1') {
  console.log(`${webhookUrl ? 'DRY_RUN' : 'No SLACK_WEBHOOK_URL'}: would post to Slack:`);
  console.log(JSON.stringify(message, null, 2));
  process.exit(0);
}

const res = await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(message),
});
if (!res.ok) throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
console.log(`Posted ${tag} (${isReleased ? 'released' : 'failed'}) to Slack.`);
