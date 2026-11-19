import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { getLinearReleaseConfig } from './linear-release-config.mjs';

const [app, tag, notesPath] = process.argv.slice(2);
const notes = JSON.parse(readFileSync(notesPath, 'utf8'));
const config = getLinearReleaseConfig({ app, tag, previous: notes.previous });
if (config.error || notes.tag !== tag || notes.app !== app) {
  console.error(config.error ?? 'Release notes do not match the selected app and tag.');
  process.exit(1);
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
if (head !== git('rev-parse', `${tag}^{commit}`)) {
  console.error('Checkout must point at the production tag.');
  process.exit(1);
}
// A divergent hardfork release scans only commits added since the common ancestor.
const base = config.previous ? git('merge-base', config.previous, head) : head;
if (config.previous && base !== git('rev-parse', `${config.previous}^{commit}`)) {
  console.log('::warning::Previous production tag is not an ancestor; scanning from the common ancestor.');
}
appendFileSync(process.env.GITHUB_OUTPUT, `base-ref=${base}\ninclude-paths=${config.includePaths}\n`);
