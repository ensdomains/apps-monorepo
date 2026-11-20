import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

const run = (linear, overrides = {}) => {
  const dir = mkdtempSync(resolve(tmpdir(), 'release-slack-'));
  try {
    const output = execFileSync(process.execPath, [resolve('scripts/release-slack.mjs'), dir], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DRY_RUN: '1',
        TAG: 'manager-2026-11-06',
        GITHUB_REPOSITORY: 'ensdomains/apps-monorepo',
        GITHUB_RUN_ID: '123',
        NEEDS: JSON.stringify({ prepare: { result: 'success' }, cloudflare: { result: 'success' }, release: { result: 'success' }, linear, ...overrides }),
      },
    });
    return JSON.parse(output.slice(output.indexOf('{')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

for (const [result, outputs, expected] of [
  ['failure', {}, 'Linear sync failed'],
  ['success', { status: 'pending-key' }, 'pipeline access key'],
  ['success', { status: 'success', 'release-url': 'https://linear.app/enslabs/release/example' }, 'https://linear.app/enslabs/release/example'],
]) {
  test(`reports a successful deploy separately from Linear ${result} ${outputs.status ?? ''}`, () => {
    const message = run({ result, outputs });
    assert.match(message.text, /released to mainnet/);
    assert.match(JSON.stringify(message.blocks), new RegExp(expected));
  });
}

test('a deployment failure still identifies the failed deployment job', () => {
  const message = run({ result: 'skipped' }, { cloudflare: { result: 'failure' }, release: { result: 'skipped' } });
  assert.match(message.text, /release failed/);
  assert.match(JSON.stringify(message.blocks), /Failed at \*Cloudflare deploy\*/);
});
