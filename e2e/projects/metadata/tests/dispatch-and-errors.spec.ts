/**
 * MD6 — invariant sweep: URL dispatch correctness, graceful degradation, and
 * webhook auth, run across every scenario rather than owned by one (see
 * `e2e-build-goal.md` §9 Track B).
 *
 * Includes one deliberately-not-a-success case: the v1 tokenId-keyed unified
 * metadata route (`/:network/:contractAddress/:tokenId`) requires the
 * indexer to reverse a tokenId's hash back to a name — there is no on-chain
 * fallback for that specific reversal (see `helpers/metadataService.ts`).
 * With this harness's indexers deliberately unreachable, the correct,
 * production-faithful behavior is a clean 503/404, never a 500 — that is
 * what this sweep actually verifies, not a successful resolve.
 *
 * Also includes one known, filed defect (E2E-005, `test.fail()` — the
 * assertion is correct and currently fails, deliberately; the test still
 * *runs*, so a real fix flips it green instead of the regression rotting
 * unnoticed): `/registry-hierarchy/:name` 500s for every input.
 */

import { expect, test } from '@playwright/test'
import { keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { revertTo, takeSnapshot } from '../../../fixtures/chain-snapshot.js'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
} from '../../../fixtures/makeV1Name.js'
import {
  type EnsNameEvent,
  makeNameEvent,
  signWebhookEvent,
} from '../../../fixtures/metadataWebhook.js'
import { createAccounts } from '../../../fixtures/playwright.portal.fixture.js'
import {
  METADATA_SERVICE_URL,
  routes,
} from '../../../helpers/metadataService.js'

// Tags live on each individual `test()` call, not on `test.describe()` —
// `coverage/reconcile.ts`'s `scanSpec` only reads a `test.describe` tag when
// the whole call (title + tag object) is on one line, unlike an individual
// `test()`, whose first several lines it scans.
test.describe('MD6 — dispatch, graceful degradation, and webhook auth', () => {
  test('GET / and GET /health both respond 200', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    const rootRes = await request.get(routes.root())
    expect(rootRes.status()).toBe(200)

    // /health always returns 200 — degraded dependencies show up in the JSON
    // body's `status`/`dependencies` fields, not the HTTP status (see
    // src/index.ts's health handler; this is also why the docker-compose
    // healthcheck for this container targets /health rather than a stricter
    // liveness probe).
    const healthRes = await request.get(routes.health())
    expect(healthRes.status()).toBe(200)
    const health = (await healthRes.json()) as {
      dependencies?: { mainnet?: string; sepolia?: string }
    }
    expect(health.dependencies?.mainnet).toBeTruthy()
    expect(health.dependencies?.sepolia).toBeTruthy()
  })

  test('an unregistered name never 500s — 404, 503, or a definitive unmigrated status per route', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    // Not a uniform 404 across routes — verified empirically, then read
    // against `FallbackService.executeWithFallback`'s own documented
    // taxonomy (`src/services/fallback.ts`):
    //
    //   - avatar: reads ownership directly (no FallbackService involved) →
    //     genuinely not found → 404.
    //   - unified metadata (name-keyed): goes through
    //     `FallbackService.executeWithFallback`, whose `sawUpstream` guard
    //     deliberately refuses to report "not found" when an earlier tier hit
    //     a real upstream failure — even though the blockchain tier's own
    //     read is a definitive NotFoundError. With this harness's indexer
    //     unreachable (a real upstream failure), that guard is exactly what
    //     fires, correctly producing 503 rather than a confident-but-unproven
    //     404. This mirrors this very suite's own K3 principle ("indexer
    //     up but wrong must not present a confident negative") — not a bug.
    //   - migration-status: its own classification semantics, not an
    //     existence check — "unmigrated" + zero owner is exactly what "no v2
    //     record" should say regardless of whether a v1 record exists.
    //
    // registry-hierarchy excluded entirely — see the dedicated, known-failing
    // regression test below (E2E-005).
    const bogus = `md6-never-registered-${Date.now()}.eth`

    const avatarRes = await request.get(routes.avatar('sepolia', bogus))
    expect(
      avatarRes.status(),
      'avatar should read ownership directly and 404',
    ).toBe(404)

    const metaRes = await request.get(routes.metadataByName('sepolia', bogus))
    expect(
      metaRes.status(),
      'unified metadata for an unregistered name, with indexers down, should refuse to confirm "not found" (503), not fabricate a 404 or crash (500)',
    ).toBe(503)

    const statusRes = await request.get(
      routes.migrationStatus(bogus, 'sepolia'),
    )
    expect(statusRes.status()).toBe(200)
    const status = (await statusRes.json()) as {
      status: string
      owner?: string
    }
    expect(status.status).toBe('unmigrated')
  })

  test('registry-hierarchy resolves for a registered name instead of 500ing (E2E-005)', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    test.fail()
    const before = await takeSnapshot()
    try {
      const accounts = createAccounts()
      const makeV1Name = createMakeV1Name({
        userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
      })
      const name = await makeV1Name({ label: 'md6-hierarchy' })

      const res = await request.get(routes.registryHierarchy(name, 'sepolia'))
      expect(
        res.status(),
        "GET /registry-hierarchy 500s unconditionally (KV expiration_ttl of 30s is below Cloudflare KV's 60s minimum) — src/services/metadata.ts getRegistryHierarchy / src/services/cache.ts CacheService.set",
      ).toBe(200)
    } finally {
      await revertTo(before)
    }
  })

  test('an invalid registryType segment is rejected with 400, not silently misrouted', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    const res = await request.get(
      `${METADATA_SERVICE_URL}/sepolia/not-a-real-type/whatever.eth`,
    )
    expect(res.status()).toBe(400)
  })

  test('the v1 tokenId-keyed route degrades gracefully without a reachable indexer', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    const before = await takeSnapshot()
    try {
      const accounts = createAccounts()
      const makeV1Name = createMakeV1Name({
        userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
      })
      const name = await makeV1Name({ label: 'md6-tokenid' })
      const label = name.replace(/\.eth$/, '')
      const tokenId = BigInt(keccak256(toHex(label))).toString()

      const res = await request.get(
        routes.metadataByTokenId('sepolia', V1_BASE_REGISTRAR, tokenId),
      )
      expect(
        res.status(),
        'a tokenId lookup with no indexer reachable must fail cleanly (503/404), never crash (500)',
      ).not.toBe(500)
      expect([404, 503]).toContain(res.status())
    } finally {
      await revertTo(before)
    }
  })

  test('batch-metadata rejects an empty names array and more than 100 names', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    const empty = await request.post(routes.batchMetadata(), {
      data: { names: [] },
    })
    expect(empty.status()).toBe(400)

    const tooMany = await request.post(routes.batchMetadata(), {
      data: { names: Array.from({ length: 101 }, (_, i) => `name-${i}.eth`) },
    })
    expect(tooMany.status()).toBe(400)
  })

  test('webhook: an incorrectly signed request is rejected with 401', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    const event = makeNameEvent({
      event_type: 'AvatarUpdated',
      protocol: 'v2',
      name: 'whatever.eth',
    })
    const rawBody = JSON.stringify(event)
    const res = await request.post(routes.webhook(), {
      headers: {
        'content-type': 'application/json',
        'x-webhook-timestamp': String(event.timestamp),
        'x-webhook-signature':
          'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      },
      data: rawBody,
    })
    expect(res.status()).toBe(401)
  })

  test('webhook: a stale timestamp outside the replay window is rejected with 401', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1h old — outside any documented tolerance (120s–300s)
    const event = makeNameEvent({
      event_type: 'AvatarUpdated',
      protocol: 'v2',
      name: 'whatever.eth',
      timestamp: staleTimestamp,
    })
    const signed = signWebhookEvent(event)
    const res = await request.post(routes.webhook(), {
      headers: signed.headers,
      data: signed.rawBody,
    })
    expect(res.status()).toBe(401)
  })

  test('webhook: an event with neither name nor namehash is rejected with 400', {
    tag: ['@scenario:MD6'],
  }, async ({ request }) => {
    const { name: _omit, ...withoutName } = makeNameEvent({
      event_type: 'AvatarUpdated',
      protocol: 'v2',
      name: 'whatever.eth',
    })
    const event = {
      ...withoutName,
      name: null,
      namehash: null,
    } satisfies EnsNameEvent
    const signed = signWebhookEvent(event)
    const res = await request.post(routes.webhook(), {
      headers: signed.headers,
      data: signed.rawBody,
    })
    expect(res.status()).toBe(400)
  })
})
