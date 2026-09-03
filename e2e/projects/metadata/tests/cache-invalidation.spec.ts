/**
 * MD5 — cache invalidation (WEB-1191, ticket item 4): register a name, set an
 * avatar, change the avatar, and confirm the metadata service serves the new
 * state. `POST /webhook` (docs/webhook.md) is the actual mechanism production
 * uses for this — waiting out the real ~1h TTL (see v1-resolution.spec.ts's
 * Cache-Control assertion for that exact figure) isn't practical in CI, and
 * isn't what's being asked whether it "works": the webhook-triggered purge
 * is.
 *
 * Targets the unified metadata route (`/:network/:registryType/:name`), not
 * the rendered NFT-card image route or the plain `/:network/avatar/:name`
 * route:
 *
 *   - Plain avatar route: confirmed by reading `src/services/avatar.ts`
 *     `resolveMedia` — it re-resolves the text record and re-fetches on
 *     *every* request with no caching layer at all, so it already reflects a
 *     changed record immediately. Asserted below as the control case: there
 *     is nothing to invalidate there, and it should not need the webhook.
 *   - Rendered image route: genuinely cached, and the intuitively
 *     "closest to the ticket" target, but generating it requires a font
 *     (`Satoshi-Bold.ttf`) that ships only in a private sibling repo
 *     (`canvas-cf`) this harness has no access to — confirmed live (`Font
 *     not found in R2: fonts/Satoshi-Bold.ttf`, 500, regardless of caching).
 *     An environment gap, not a service defect — not filed as an E2E-xxx
 *     row. See `infra/metadata-service/entrypoint.sh`.
 *   - Unified metadata JSON: also genuinely cached (`MetadataCacheService`,
 *     KV, `X-Cache-Status`, see `handleMetadata`) and needs no image
 *     rendering. This is the route the test exercises.
 *
 * The oracle is `MetadataResponse.last_request_date` (a fresh
 * `Date.now()` stamped only when the response is actually regenerated —
 * see `buildMetadataFromBlockchain`), not `X-Cache-Status` alone: this route
 * also sits behind the L0 edge cache (`caches.default`, `edgeCacheMatch` in
 * `src/index.ts`), which stores a full clone of the first response —
 * headers included — and replays it verbatim on a same-colo repeat request.
 * Locally that means a second immediate request echoes the *first*
 * response's `X-Cache-Status: miss` rather than reporting the KV hit
 * underneath it (confirmed live: the second request returns in ~1ms, an
 * edge-cache hit, yet still carries the header from the original miss).
 * `last_request_date` is unaffected by which layer served the response: it
 * only moves when the origin actually re-ran `buildMetadataFromBlockchain`.
 */
import { getResolver, getTextRecord } from '@ensdomains/ensjs/public'
import { setRecords } from '@ensdomains/ensjs/wallet'
import { expect, test } from '@playwright/test'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { revertTo, takeSnapshot } from '../../../fixtures/chain-snapshot.js'
import { createMakeV2Name } from '../../../fixtures/makeV2Name.js'
import {
  makeNameEvent,
  signWebhookEvent,
} from '../../../fixtures/metadataWebhook.js'
import { createAccounts } from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  type MetadataResponse,
  routes,
} from '../../../helpers/metadataService.js'
import { BLUE_AVATAR_DATA_URI, RED_AVATAR_DATA_URI } from './testImages.js'

// Tags live on each individual `test()` call, not on `test.describe()` —
// `coverage/reconcile.ts`'s `scanSpec` only reads a `test.describe` tag when
// the whole call (title + tag object) is on one line, unlike an individual
// `test()`, whose first several lines it scans.
test.describe('MD5 — cache invalidation', () => {
  test('a signed webhook purges the cached metadata response after the avatar record changes', {
    tag: ['@scenario:MD5'],
  }, async ({ request }) => {
    const before = await takeSnapshot()
    try {
      const accounts = createAccounts()
      const ownerAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
      const makeV2Name = createMakeV2Name({ userAccount: ownerAccount })
      const name = await makeV2Name({
        label: 'md5-cache',
        records: [{ key: 'avatar', value: RED_AVATAR_DATA_URI }],
      })

      // Independent oracle for the "before" state.
      const initialRecord = await getTextRecord(publicClient, {
        name,
        key: 'avatar',
      })
      expect(initialRecord).toBe(RED_AVATAR_DATA_URI)

      const firstFetch = await request.get(
        routes.metadataByName('sepolia', name),
      )
      expect(firstFetch.status()).toBe(200)
      expect(
        firstFetch.headers()['x-cache-status'],
        'first request for never-before-fetched metadata should be a cache miss',
      ).toBe('miss')
      const firstMeta = (await firstFetch.json()) as MetadataResponse

      const secondFetch = await request.get(
        routes.metadataByName('sepolia', name),
      )
      expect(secondFetch.status()).toBe(200)
      const secondMeta = (await secondFetch.json()) as MetadataResponse
      expect(
        secondMeta.last_request_date,
        'a second, immediate request should be served from cache (some layer), not regenerated',
      ).toBe(firstMeta.last_request_date)

      // ── Change the record on-chain, signed by the name's real owner ──
      const resolverAddress = await getResolver(publicClient, { name })
      if (!resolverAddress) {
        throw new Error(
          `[MD5] ${name} has no resolver — makeV2Name did not wire one`,
        )
      }
      // `walletClient` (helpers/anvil-client.ts) has no bound account — ensjs's
      // `setRecords` wallet action needs one, so build a one-off client bound
      // to the name's real owner, matching makeV2Name.ts's own pattern.
      const ownerClient = createWalletClient({
        account: ownerAccount,
        chain: walletClient.chain,
        transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
      })
      const setHash = await setRecords(ownerClient, {
        name,
        resolverAddress,
        texts: [{ key: 'avatar', value: BLUE_AVATAR_DATA_URI }],
      })
      await publicClient.waitForTransactionReceipt({ hash: setHash })

      const changedRecord = await getTextRecord(publicClient, {
        name,
        key: 'avatar',
      })
      expect(
        changedRecord,
        'setRecords did not actually change the on-chain avatar text record — the test fixture is broken, not the service',
      ).toBe(BLUE_AVATAR_DATA_URI)

      // Cache is still stale at this point — the service has no reason yet
      // to know the record changed. This is the state the invalidation
      // mechanism must fix.
      const staleFetch = await request.get(
        routes.metadataByName('sepolia', name),
      )
      const staleMeta = (await staleFetch.json()) as MetadataResponse
      expect(
        staleMeta.last_request_date,
        'still serving the pre-change cached response, as expected before invalidation',
      ).toBe(firstMeta.last_request_date)

      // ── Drive invalidation the documented way ────────────────────────
      const event = makeNameEvent({
        event_type: 'AvatarUpdated',
        protocol: 'v2',
        name,
      })
      const signed = signWebhookEvent(event)
      const webhookRes = await request.post(routes.webhook(), {
        headers: signed.headers,
        data: signed.rawBody,
      })
      expect(
        webhookRes.status(),
        `POST /webhook was rejected: ${await webhookRes.text()}`,
      ).toBe(200)
      const webhookBody = (await webhookRes.json()) as {
        status: string
        name: string
      }
      expect(webhookBody.status).toBe('success')
      expect(webhookBody.name.toLowerCase()).toBe(name.toLowerCase())

      // ── The underlying (KV) cache must have been purged ──────────────
      // A cache-busting query param defeats the L0 edge cache (keyed on the
      // exact request URL, `edgeCacheMatch(c.req.url)`) without changing the
      // KV cache key (`meta:{network}:{registryType}:{name}` — no query
      // param involved), so this specifically proves the KV layer the
      // webhook is documented to invalidate. See the dedicated, separately
      // filed test below for the L0 edge cache, which — confirmed live —
      // the webhook does NOT purge for this route.
      const bustedUrl = `${routes.metadataByName('sepolia', name)}?_e2e_cb=${Date.now()}`
      const finalFetch = await request.get(bustedUrl)
      expect(finalFetch.status()).toBe(200)
      const finalMeta = (await finalFetch.json()) as MetadataResponse
      expect(
        finalMeta.last_request_date,
        'the webhook should have purged the KV cache — an unchanged last_request_date means invalidation did not take effect',
      ).toBeGreaterThan(firstMeta.last_request_date)

      // Control: the plain avatar route needed no invalidation at all — it
      // was already serving the new record before the webhook call.
      const avatarRes = await request.get(routes.avatar('sepolia', name))
      expect(avatarRes.status()).toBe(200)
      expect((await avatarRes.body()).toString('base64')).toBe(
        BLUE_AVATAR_DATA_URI.split('base64,')[1],
      )
    } finally {
      await revertTo(before)
    }
  })

  test('the webhook does not purge the L0 edge cache for the unified metadata route (E2E-006)', {
    tag: ['@scenario:MD5'],
  }, async ({ request }) => {
    test.fail()
    const before = await takeSnapshot()
    try {
      const accounts = createAccounts()
      const ownerAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
      const makeV2Name = createMakeV2Name({ userAccount: ownerAccount })
      const name = await makeV2Name({
        label: 'md5-edge-gap',
        records: [{ key: 'avatar', value: RED_AVATAR_DATA_URI }],
      })

      const url = routes.metadataByName('sepolia', name)
      const firstMeta = (await (
        await request.get(url)
      ).json()) as MetadataResponse

      const resolverAddress = await getResolver(publicClient, { name })
      if (!resolverAddress) throw new Error(`[MD5] ${name} has no resolver`)
      const ownerClient = createWalletClient({
        account: ownerAccount,
        chain: walletClient.chain,
        transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
      })
      const setHash = await setRecords(ownerClient, {
        name,
        resolverAddress,
        texts: [{ key: 'avatar', value: BLUE_AVATAR_DATA_URI }],
      })
      await publicClient.waitForTransactionReceipt({ hash: setHash })

      const event = makeNameEvent({
        event_type: 'AvatarUpdated',
        protocol: 'v2',
        name,
      })
      const signed = signWebhookEvent(event)
      await request.post(routes.webhook(), {
        headers: signed.headers,
        data: signed.rawBody,
      })

      // Same exact URL as the first request — an L0 edge-cache hit replays
      // the original response (headers, body, `last_request_date`, all of
      // it) verbatim, unaffected by the webhook: `handleWebhook`'s edge-purge
      // loop (src/index.ts) only deletes `{registry,namewrapper}/{name}/
      // {image,rasterize}` cache keys, never the bare metadata URL —
      // even though `handleMetadata` is the one putting it into that same
      // L0 cache in the first place.
      // The CORRECT behavior, asserted normally (per `e2e-build-goal.md` §5
      // rule 1 — never weaken the assertion to match the bug): a purge
      // should make this URL regenerate too. `test.fail()` above records
      // that it currently does not.
      const afterMeta = (await (
        await request.get(url)
      ).json()) as MetadataResponse
      expect(
        afterMeta.last_request_date,
        'the L0 edge cache for this exact URL was never purged, so it is still replaying the pre-webhook response',
      ).toBeGreaterThan(firstMeta.last_request_date)
    } finally {
      await revertTo(before)
    }
  })
})
