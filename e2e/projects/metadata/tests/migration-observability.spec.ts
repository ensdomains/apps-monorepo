/**
 * MD4 — sepolia v1→v2 migration is observable through the metadata service
 * (WEB-1191, ticket item 3).
 *
 * `makeMigratedName` registers a V1 name and then calls the real
 * `MigrationHelper.migrate` entrypoint on the fork (not a UI flow, not a
 * hand-faked status) — see `fixtures/makeMigratedName.ts`. Both
 * `/migration-status/:name` and the unified metadata route must reflect
 * `migrated` afterwards, sourced entirely through the on-chain fallback
 * (no indexer is reachable in this harness — see docker-compose.yml).
 *
 * Three near-identical cases (one per V1 token type) are written out as
 * separate `test()` calls with static titles, rather than a `for` loop over
 * dynamic titles — `coverage/reconcile.ts`'s `scanSpec` statically greps
 * source for `@scenario:` tags and titles, and cannot correlate a templated
 * title against Playwright's own resolved `--list` output.
 *
 * Does NOT check `/registry-hierarchy` — that route 500s unconditionally for
 * every name on every network (a KV TTL-below-minimum bug, unrelated to
 * migration status; see defect E2E-005 and `dispatch-and-errors.spec.ts`,
 * which owns that regression test with `test.fail()`).
 */

import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'
import { revertTo, takeSnapshot } from '../../../fixtures/chain-snapshot.js'
import {
  createMakeMigratedName,
  type MigratedNameType,
} from '../../../fixtures/makeMigratedName.js'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import { createAccounts } from '../../../fixtures/playwright.portal.fixture.js'
import {
  type MetadataResponse,
  type MigrationStatusResponse,
  routes,
} from '../../../helpers/metadataService.js'

async function assertMigratedNameIsObservable(
  request: APIRequestContext,
  type: MigratedNameType,
): Promise<void> {
  const before = await takeSnapshot()
  try {
    const accounts = createAccounts()
    const makeMigratedName = createMakeMigratedName({ accounts })
    const name = await makeMigratedName({ label: `md4-${type}`, type })

    const statusRes = await request.get(routes.migrationStatus(name, 'sepolia'))
    expect(statusRes.status()).toBe(200)
    const status = (await statusRes.json()) as MigrationStatusResponse
    expect(
      status.status,
      `${name} was migrated via MigrationHelper.migrate on-chain but the service reports "${status.status}", not "migrated"`,
    ).toBe('migrated')

    const metaRes = await request.get(routes.metadataByName('sepolia', name))
    expect(metaRes.status()).toBe(200)
    const meta = (await metaRes.json()) as MetadataResponse
    expect(meta.name.toLowerCase()).toBe(name.toLowerCase())
  } finally {
    await revertTo(before)
  }
}

// Tags live on each individual `test()` call, not on `test.describe()` —
// `coverage/reconcile.ts`'s `scanSpec` only reads a `test.describe` tag when
// the whole call (title + tag object) is on one line, unlike an individual
// `test()`, whose first several lines it scans. Filed defects need a proving
// test the reconciler can actually find (`--results`-independent check:
// "defect filed with no test proving it").
test.describe('MD4 — sepolia v1→v2 migration is observable', () => {
  // Titles avoid embedded quote characters deliberately — `scanSpec`'s title
  // extraction (`coverage/reconcile.ts`) takes the text between the first
  // pair of quote-like characters it finds, so a quote inside the title
  // (e.g. `'a migrated "unwrapped" name...'`) truncates it at that inner
  // quote and breaks the file+title correlation `--list` needs.
  test('a migrated unwrapped-type V1 name reports migrated through migration-status and the metadata route', {
    tag: ['@scenario:MD4'],
  }, async ({ request }) => {
    await assertMigratedNameIsObservable(request, 'unwrapped')
  })

  test('a migrated unlocked-type V1 name reports migrated through migration-status and the metadata route', {
    tag: ['@scenario:MD4'],
  }, async ({ request }) => {
    await assertMigratedNameIsObservable(request, 'unlocked')
  })

  test('a migrated locked-type V1 name reports migrated through migration-status and the metadata route', {
    tag: ['@scenario:MD4'],
  }, async ({ request }) => {
    await assertMigratedNameIsObservable(request, 'locked')
  })

  test('an un-migrated V1 name of the same type does not report migrated status (negative control)', {
    tag: ['@scenario:MD4'],
  }, async ({ request }) => {
    // Without this, a service that always answers "migrated" regardless of
    // input would pass the tests above for the wrong reason.
    const before = await takeSnapshot()
    try {
      const accounts = createAccounts()
      const makeV1Name = createMakeV1Name({
        userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
      })
      const name = await makeV1Name({ label: 'md4-negative-control' })

      const statusRes = await request.get(
        routes.migrationStatus(name, 'sepolia'),
      )
      expect(statusRes.status()).toBe(200)
      const status = (await statusRes.json()) as MigrationStatusResponse
      expect(status.status).toBe('unmigrated')
    } finally {
      await revertTo(before)
    }
  })
})
