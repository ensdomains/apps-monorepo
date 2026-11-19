import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLinearReleaseConfig } from './linear-release-config.mjs';

for (const [app, directory] of [['manager', 'apps/manager'], ['portal', 'apps/portal'], ['api-worker', 'workers/api-worker']]) {
  test(`${app} includes its app and shared code, but no other app`, () => {
    const config = getLinearReleaseConfig({ app, tag: `${app}-2026-11-06.2`, previous: `${app}-2026-11-05` });
    assert.equal(config.includePaths, `${directory}/**,packages/**,package.json,pnpm-workspace.yaml,pnpm-lock.yaml,patches/**`);
  });
}
for (const overrides of [
  { app: 'unknown' },
  { tag: 'portal-2026-11-06' },
  { tag: 'manager-v1.0.0' },
  { tag: 'manager-2026-11-06.1' },
  { previous: 'api-worker-2026-11-05' },
]) {
  test(`rejects mismatched or invalid release input ${JSON.stringify(overrides)}`, () => {
    const config = getLinearReleaseConfig({ app: 'manager', tag: 'manager-2026-11-06', previous: null, ...overrides });
    assert.equal(config.error, 'Release tags must belong to the selected app and use its production date-tag format.');
  });
}
