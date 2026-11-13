# Manual metadata service testing (WEB-1191)

How to drive the ENS Metadata Service (`github.com/ensdomains/metadata-service-v2`,
run locally by the `metadata-service` container) by hand — no scripts, just a
browser. This is the manual companion to the automated suite at
`e2e/projects/metadata/` (`pnpm e2e:metadata`); use this doc for exploratory QA,
sign-off before a deploy, or handing the run to a browser agent ("Claude in
Chrome") that clicks buttons and reads JSON rather than writing TypeScript.

Two tools, both plain web pages with no login and no wallet popups once set up:

1. **The service's own Endpoint Tester** (`demo/index.html`, shipped in the
   service's repo) — one card per route, a Run button, JSON/image preview.
   This is where every actual check happens.
2. **The manager app's Dev Tools drawer** (`Migration` tab) — one click per
   preset to create v1 names, records, and migrations on the local fork. This
   is where test data comes from.

## Setup

### 1. Start the local stack

```bash
pnpm e2e:infra:up
```

Brings up Anvil (sepolia fork, `:8545`), a second read-only Anvil (mainnet
fork, `:8546`), the metadata service itself (`:8787` — first run builds the
pinned commit's image, which can take a few minutes), and the other e2e
services (alto/paymaster/panoptes/mockestrator/dqa — used by other suites,
harmless if idle here).

Confirm the service is actually up:

```bash
curl http://localhost:8787/health
```

Expect `dependencies.mainnet` and `dependencies.sepolia` = `"ok"`, and
`dependencies.indexer` = `"error"`. That last one is **expected, not a
failure** — this local stack deliberately has no indexer running (there's no
local service speaking its GraphQL dialect), so every check below exercises
the metadata service's own on-chain-fallback path. That path is itself real,
tested production behavior — see `e2e/infra/docker-compose.yml`'s comment on
the `metadata-service` block, and `e2e/projects/metadata/tests/*.spec.ts` for
the automated version of everything in this doc.

### 2. Get the Endpoint Tester into Chrome

The service repo ships its own manual-testing page. Pull it out of the running
container once (it's a static file, nothing to build):

```bash
docker cp infra-metadata-service-1:/app/demo/index.html /tmp/metadata-endpoint-tester.html
```

Then open in Chrome, either by double-clicking the file or navigating to:

```
file:///tmp/metadata-endpoint-tester.html
```

It's fully static — every button just runs a `fetch()` in the page itself, so
`file://` works with no server, and the service allows CORS from anywhere. In
the config bar at the top:

- **API Base URL** → `http://localhost:8787`
- **Network** → `mainnet` or `sepolia`, set per check below
- **Name** → the name you're testing, set per check below
- **Run All** re-runs every visible card for the current Network/Name; each
  card also has its own **Run** button

This is the page to hand to a browser agent — plain buttons, JSON/image output,
no auth.

### 3. Start the manager app for test-data creation

```bash
cd apps/manager
VITE_MIGRATION_TOOL=1 VITE_USE_MOCK_WALLET=true VITE_FF_USE_EOA=true pnpm dev
```

Open `http://localhost:3000`. The mock wallet auto-connects as
`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Anvil account #0) — already
funded with ETH/USDC/DAI by `pnpm e2e:infra:up`, and the same account the Dev
Tools panel injects names for (its presets are hardcoded to this address —
injection is address-scoped, so a different connected address sees nothing).

Open the dev drawer (bottom-right, left of the TanStack devtools button) →
**Migration** tab. If there's no drawer at all: it only renders when
`VITE_MIGRATION_TOOL`, `VITE_TIME_TRAVEL`, or `VITE_DQA` is set
(`packages/dev-tools/src/config.ts`) — this reads as "dev tools are broken"
rather than "switched off" if you forget the env var.

## Test data plan

| Need | How |
|---|---|
| A v1 name on sepolia, no records | Dev drawer → Migration → click **Unwrapped**. Note the generated label shown on the button/toast (`devNNNN.eth`) |
| A v1 name on sepolia with an avatar/header already set | Dev drawer → Migration → click **Records** — sets `avatar` to `https://avatar-upload-staging.ens-cf.workers.dev/sepolia/qa.eth` and `header` to `https://example.com/qa-banner.png` on a fresh unwrapped 2LD. This is a *real HTTP URL* avatar, not a data URI — a useful complement to the automated suite, which uses inline data URIs for hermeticity |
| A v2-native name on sepolia | The manager's real **Register** flow (search a name from `/`, complete registration) — the dev panel has no v2-native preset; this is the actual user path, and with the mock wallet + EOA mode above it needs no wallet popups |
| A migrated (v1→v2) name on sepolia | Dev drawer → Migration → click a v1 preset (e.g. **Unwrapped**) → select it in the dropdown → **Migrate** → complete the real migration flow that opens at `/migration` |
| A real mainnet v1 name | Nothing to seed — read any long-registered name, e.g. `ens.eth` |

`/migration` is gated by a PostHog flag (`migration`) keyed on the connected
address, with no dev bypass. If finishing a migration redirects you to
`/dashboard` instead, open Chrome DevTools → **Console** on the manager tab and
run:

```js
window.posthog.featureFlags.overrideFeatureFlags({ flags: { migration: true } })
```

then reload.

## Manual test runs

Each section below maps to one row of the ticket / the automated suite's `MD*`
scenarios (`e2e/docs/e2e-test-catalogue.md`'s `MD` section has the full
mapping). Do these in the Endpoint Tester unless noted.

### MD1 — mainnet v1 name resolves correctly

1. Network = `mainnet`, Name = `ens.eth` (or any other long-registered name).
2. Run **Detailed Health Check** — `mainnet` reads `"ok"`.
3. Run **Metadata — ens.eth** — 200, `name` matches, `is_normalized: true`.
4. Run **Migration Status — ens.eth** — `status: "unmigrated"` (mainnet has no
   v2 deployment yet, so this is the only correct answer for *any* mainnet
   name).
5. Run **Avatar — ens.eth** — either a rendered image or a clean 404, never an
   error.

### MD2 — sepolia v1 name resolves correctly

1. Seed: Dev drawer → **Unwrapped** → note the label.
2. Network = `sepolia`, Name = that label.
3. Run **Metadata — {name}** — 200, name matches.
4. Run **Migration Status** — `"unmigrated"`.
5. Run **Avatar** — 404 (this preset sets no record; see MD2b for one that
   does).
6. The ticket's "~1 hour" cache figure, exactly: open Chrome DevTools →
   **Network** tab, re-run the Metadata card, inspect the response's
   `Cache-Control` header. Expect
   `public, max-age=3600, stale-while-revalidate=601200` for an unmigrated
   name.

### MD2b — v1 avatar via a real HTTP record

1. Seed: Dev drawer → **Records**.
2. Network = `sepolia`, Name = that label.
3. Run **Avatar** — this fetches a real external URL
   (`avatar-upload-staging.ens-cf.workers.dev`). If that staging service is
   itself down you'll see a 404 rather than an image — that's an external
   dependency being unavailable, not this service failing.
4. Run **Avatar Metadata** — inspect `host_meta` / `image_url` in the JSON.

### MD3 — sepolia v2 name resolves correctly

1. Seed: register a fresh name through the manager's real Register flow.
2. Network = `sepolia`, Name = the registered name.
3. Run **Metadata — {name}** and **Metadata via NameWrapper — {name}** — both
   200, same `name`/`is_normalized` (the registry-vs-namewrapper URL shape
   only changes presentation, not classification).
4. Run **Migration Status** — `"migrated"`, **not** `"native"` — with no
   indexer running, the on-chain fallback can't distinguish "born on v2" from
   "migrated to v2" (both are just "currently on v2"), so it conservatively
   reports `"migrated"` for both. See `v2-resolution.spec.ts`'s comment for
   the full explanation.
5. Run **Image** / **Rasterize** — these will likely 500 in a local checkout
   unless you have the private `canvas-cf` font asset available to the
   container. That's a known environment gap (see
   `cache-invalidation.spec.ts`'s docstring), not something to file as a new
   defect.

### MD4 — v1→v2 migration is observable

1. Seed a v1 name (Dev drawer → any preset), then migrate it: select it in
   the dropdown → **Migrate** → complete the flow at `/migration` (apply the
   PostHog override above if you get redirected).
2. Network = `sepolia`, Name = the migrated name.
3. Run **Migration Status** — `"migrated"`.
4. Run **Metadata** — 200, name matches.

### MD5 — cache invalidation

The Endpoint Tester has no card for `POST /webhook` (it needs an HMAC
signature the UI doesn't build) — run it from Chrome DevTools' **Console** tab
instead, on the Endpoint Tester page itself so `fetch` has somewhere to run
from.

1. Seed a **v2 name** (the manager's real Register flow, as in MD3 — not a
   Dev Tools v1 preset). The manager's record-editing dialog only appears for
   a name you're connected as owner of *and* that's on the v2 path
   (`ProfileEditAction.tsx` hides it for an unmigrated v1 name), so a v1
   preset won't work for the "change a record" step below.
2. Endpoint Tester: run **Metadata — {name}** twice. The second Run should
   show a `cache: hit` badge next to the status.
3. Change a record on-chain: open the name's profile page (`/{name}`) →
   **Edit** → any tab → change a value → **Save Profile**. Two options:
   - **General** tab → **Profile picture** — the literal "avatar" case the
     ticket describes, but it uploads through a separate service
     (`ens-avatar-worker`), which isn't part of this local stack. If the
     upload itself fails, that's this dependency being unavailable, not the
     metadata service.
   - **Simpler, no extra dependency** — any other tab (e.g. **Links** →
     Website, or **Contact** → Email) sets a plain text record directly via
     the resolver, no upload service involved. The metadata service's cache
     is keyed by name, not by which record changed, so this exercises the
     exact same invalidation path — just mentally substitute that record for
     "avatar" below.
4. Run **Metadata** again — still shows the old (cached) data. Expected —
   nothing has invalidated it yet.
5. In the Console, paste and run (the secret below is this stack's default —
   confirm against `METADATA_SERVICE_WEBHOOK_SECRET` if you changed it, see
   `e2e/infra/.env.example`):

   ```js
   const SECRET = 'e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0'
   const name = 'yourname.eth' // the name you just changed
   const ts = Math.floor(Date.now() / 1000)
   const event = {
     event_type: 'AvatarUpdated', protocol: 'v2', name,
     namehash: null, block_number: 0, tx_hash: '0x', log_index: 0,
     contract_address: '0x', data: '{}', timestamp: ts,
   }
   const body = JSON.stringify(event)
   const keyBytes = Uint8Array.from(SECRET.match(/../g).map((b) => parseInt(b, 16)))
   const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
   const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`))
   const sig = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('')
   const res = await fetch('http://localhost:8787/webhook', {
     method: 'POST',
     headers: { 'content-type': 'application/json', 'x-webhook-timestamp': String(ts), 'x-webhook-signature': `sha256=${sig}` },
     body,
   })
   console.log(res.status, await res.json())
   ```

   Equivalent from a terminal, if you'd rather not use the console:

   ```bash
   SECRET=e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0
   TS=$(date +%s)
   BODY='{"event_type":"AvatarUpdated","protocol":"v2","name":"yourname.eth","namehash":null,"block_number":0,"tx_hash":"0x","log_index":0,"contract_address":"0x","data":"{}","timestamp":'"$TS"'}'
   SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -mac HMAC -macopt hexkey:"$SECRET" | sed 's/^.* //')
   curl -X POST http://localhost:8787/webhook \
     -H "content-type: application/json" \
     -H "x-webhook-timestamp: $TS" \
     -H "x-webhook-signature: sha256=$SIG" \
     -d "$BODY"
   ```

   Expect `200 {"status":"success", ...}`.

6. Back in the Endpoint Tester, run **Metadata** once more — `cache: miss`,
   confirming the response was actually regenerated rather than replayed. (The
   record you changed in step 3 may or may not appear directly in this JSON —
   what this step proves is that the cache was purged, not the specific
   field's presence.)
7. Known, already-filed gap (**E2E-006**): this webhook call does *not* purge
   the edge cache for this same exact URL (only the image/rasterize URLs get
   that purge — see `cache-invalidation.spec.ts`'s second test). If step 6
   still looks stale, that's expected for up to 5 minutes; compare the
   response's `last_request_date` field rather than eyeballing it, and don't
   file a duplicate defect.

### MD6 — dispatch, graceful degradation, webhook auth

1. Run **Root Health Check** and **Detailed Health Check** — both always 200.
2. Set Name to something never registered (e.g.
   `definitely-not-registered-12345.eth`):
   - Run **Avatar** — 404.
   - Run **Metadata** — **503**, not 404 — with the indexer down, the service
     won't claim "not found" on a blockchain-only answer for this route (see
     `dispatch-and-errors.spec.ts`'s comment — this mirrors the same "never
     present a confident negative" principle used elsewhere in this repo's
     own e2e suite, not a bug).
   - Run **Migration Status** — 200, `"unmigrated"`.
3. Run **Registry Hierarchy** for *any* name — known, already-filed defect
   **E2E-005**: expect a 500 every time (a KV cache-TTL bug in the service).
   Confirm it's still open in `e2e/docs/e2e-defects.md`; don't file a
   duplicate.
4. Run **v1 Metadata via BaseRegistrar** (the "v1 Legacy" section — it
   computes the tokenId for you from the Name field) — expect 503 or 404,
   never 200. This route needs an indexer to reverse a tokenId back to a name;
   there's no on-chain fallback for that specific reversal, so this is a
   structural limitation of the no-indexer local stack, not a bug.
5. Run **Batch Metadata** — 200 with a `results` array covering the 3 names
   in its fixed request body.

## Reference

- Automated version of every check above:
  `e2e/projects/metadata/tests/*.spec.ts` — run with `pnpm e2e:metadata`.
- Filed defects: `e2e/docs/e2e-defects.md` (`E2E-005`, `E2E-006`).
- Scenario catalogue: `e2e/docs/e2e-test-catalogue.md`, section `MD`.
- Service source (pinned commit — see `e2e/infra/Dockerfile.metadata-service`
  for which one): `github.com/ensdomains/metadata-service-v2`.
- Sibling manual-QA docs sharing the same dev drawer:
  `e2e/docs/manual-subname-migration.md`, `e2e/docs/manual-time-travel.md`.
