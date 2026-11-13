import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve('scripts/linear-release-base.mjs');
for (const scenario of ['first', 'forward', 'redeploy', 'hardfork', 'wrong-checkout']) {
  test(`production scan range: ${scenario}`, () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'linear-base-'));
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    try {
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      git('commit', '--allow-empty', '-qm', 'Initial');
      const initial = git('rev-parse', 'HEAD');
      git('tag', 'manager-2026-11-05');
      if (scenario === 'hardfork') {
        git('commit', '--allow-empty', '-qm', 'Other production branch');
        git('tag', '-f', 'manager-2026-11-05');
        git('checkout', '--detach', '-q', initial);
      }
      if (scenario !== 'redeploy') git('commit', '--allow-empty', '-qm', 'WEB-2054: release');
      git('tag', 'manager-2026-11-06');
      const head = git('rev-parse', 'HEAD');
      if (scenario === 'wrong-checkout') git('checkout', '--detach', '-q', initial);
      const notes = resolve(dir, 'notes.json');
      const output = resolve(dir, 'output');
      writeFileSync(notes, JSON.stringify({ app: 'manager', tag: 'manager-2026-11-06', previous: scenario === 'first' ? null : 'manager-2026-11-05' }));
      const run = () => execFileSync(process.execPath, [script, 'manager', 'manager-2026-11-06', notes], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output }, stdio: 'pipe',
      });
      if (scenario === 'wrong-checkout') {
        assert.throws(run, /Checkout must point at the production tag/);
      } else {
        const logs = run();
        assert.match(readFileSync(output, 'utf8'), new RegExp(`^base-ref=${scenario === 'first' ? head : initial}\\n`));
        if (scenario === 'hardfork') assert.match(logs, /common ancestor/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
