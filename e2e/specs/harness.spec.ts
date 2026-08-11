/**
 * Harness integrity gate — rules 5 and 6 of `e2e-build-goal.md` §5.
 *
 * > 5. A fixture must verify its own postcondition by read-back, and throw.
 * >    Not "the transaction succeeded" — "the state I claimed to create is
 * >    present."
 * > 6. And that the app can see it. Assert fixture state is visible through the
 * >    same path the app reads.
 *
 * **The subject of this suite is the fixtures, not the apps.** Every other spec
 * in the tree is an argument of the form "the fixture created X, the app did Y,
 * therefore the app is correct about X". That argument is worth nothing if the
 * first premise is false — and it has been false here before, silently, for
 * weeks: `makeV1Name` registered names into a deployment the migration UI never
 * queries. Registration succeeded, nothing errored, every name was invisible to
 * the app under test, and the suite above it stayed green the whole time.
 *
 * So this runs **first**, as a Playwright project dependency, and red aborts
 * the run rather than letting the downstream suite produce confident wrong
 * results. See `projects/portal/playwright.config.ts`.
 *
 * Two rules for anything added here:
 *
 * - **Read the postcondition independently of the fixture.** Never assert on a
 *   value the fixture returned to you — that is checking the fixture against
 *   itself. Go to the chain, or to the app's own read path.
 * - **App visibility means the app's path, not any path.** A chain read proving
 *   a name exists says nothing about whether the app can find it. Both halves
 *   are required; the incident above passes the first half.
 */

import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { parseAbi } from 'viem'
import { revertTo, takeSnapshot } from '../fixtures/chain-snapshot.js'
import {
  assertQueryFields,
  isReachable,
  manifestMismatches,
  newestIndexedBlock,
  PANOPTES_URL,
  query,
} from '../fixtures/panoptes.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../fixtures/playwright.portal.fixture.js'
import { publicClient, testClient } from '../helpers/anvil-client.js'
import { ETH_REGISTRY, readNameRoles } from '../helpers/role-assertions.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

const REGISTRY_ABI = parseAbi([
  'function getSubregistry(string label) view returns (address)',
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function getExpiry(uint256 tokenId) view returns (uint64)',
  'function ownerOf(uint256 id) view returns (address)',
])

/** `PermissionedRegistry.getStatus` — 0 available, 1 reserved, 2 registered. */
const REGISTERED = 2

const tokenId = async (label: string) => {
  const { keccak256, toHex } = await import('viem')
  return BigInt(keccak256(toHex(label)))
}

const status = async (registry: `0x${string}`, label: string) =>
  publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'getStatus',
    args: [await tokenId(label)],
  })

/**
 * `ownerOf` needs the *canonical* (version-bearing) token id, not the bare
 * labelhash — note that `getStatus` takes an `anyId` and canonicalises it
 * internally while `ownerOf` does not. Reading `ownerOf(keccak256(label))`
 * returns the zero address for a perfectly healthy name, which reads as "the
 * fixture registered nothing". Same idiom as `transfer.spec.ts:65`.
 */
const owner = async (registry: `0x${string}`, label: string) =>
  publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'ownerOf',
    args: [labelToCanonicalId(label)],
  })

const expiry = async (registry: `0x${string}`, label: string) =>
  publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'getExpiry',
    args: [await tokenId(label)],
  })

const subregistry = async (registry: `0x${string}`, label: string) =>
  publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'getSubregistry',
    args: [label],
  })

const labelOf = (name: string) => name.replace(/\.eth$/, '')

test.describe('Harness integrity', () => {
  test.describe.configure({ timeout: 300_000 })

  // ── makeName ───────────────────────────────────────────────────────────

  test('makeName: the name it reports is registered on chain, to the owner it was asked for, and the portal can find it', async ({
    portalPage: page,
    wallet,
    makeName,
    accounts,
  }) => {
    const name = await makeName({ label: 'harness-makename', owner: 'user' })
    const label = labelOf(name)

    // ── rule 5: read the postcondition back off the chain ───────────────
    expect(
      await status(ETH_REGISTRY, label),
      `makeName returned ${name} but the .eth registry does not report it registered — every spec that builds on this fixture is asserting against a name that does not exist`,
    ).toBe(REGISTERED)

    expect(
      (await owner(ETH_REGISTRY, label)).toLowerCase(),
      'makeName registered the name to an address other than the one it was asked for',
    ).toBe(accounts.getAddress('user').toLowerCase())

    // An expiry in the past would make the name render as expired everywhere
    // downstream, which reads as an app bug rather than a fixture bug.
    const now = BigInt((await publicClient.getBlock()).timestamp)
    expect(
      await expiry(ETH_REGISTRY, label),
      'makeName produced a name that is already expired at the current block',
    ).toBeGreaterThan(now)

    // ── rule 6: and the app can see it, through the app's own read path ──
    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`${PORTAL_APP_URL}/${name}`)

    // Structure, not prose: the profile header renders the name itself. If the
    // portal cannot resolve it, this is where the makeV1Name class of failure
    // surfaces — chain state present, app blind to it.
    await expect(
      page.getByText(name, { exact: true }).first(),
      `${name} is registered on chain but the portal's name page does not render it — the fixture is writing somewhere the app does not read`,
    ).toBeVisible({ timeout: 30_000 })
  })

  test('makeName: a negative duration really does produce an expired name', async ({
    makeName,
  }) => {
    // The fixture overloads `duration < 0` to mean "register, then advance the
    // clock past expiry". Every grace/premium scenario depends on it, and a
    // silent no-op here would make those tests assert against an *active* name
    // while claiming to test expiry.
    //
    // Snapshotted because that advance is permanent and costs ~29 days of fork
    // clock (the 28-day minimum registration plus the requested gap). Harmless
    // in a leaf spec; not harmless here, where this project is a dependency of
    // the whole portal suite and would push the shared clock forward on every
    // run. Measured: without this, one harness run moved the fork +29 days.
    const before = await takeSnapshot()
    try {
      const name = await makeName({
        label: 'harness-expired',
        owner: 'user',
        duration: -60 * 60 * 24,
      })
      const now = BigInt((await publicClient.getBlock()).timestamp)
      expect(
        await expiry(ETH_REGISTRY, labelOf(name)),
        'makeName was asked for an expired name and produced one that is still active',
      ).toBeLessThan(now)
    } finally {
      await revertTo(before)
    }
  })

  // ── makeSubname ────────────────────────────────────────────────────────

  test('makeSubname: every level it reports is registered in its stated parent registry, with the roles it claims', async ({
    makeSubname,
    makeName,
  }) => {
    // `makeName`'s `owner` is a portal *User* slot (user / user2 / user3), not
    // a `wallets` participant name — `wallets.ROLES` maps owner→user,
    // manager→user2, stranger→user3. Passing 'owner' throws "User not found".
    // `wallets.account('owner')` is the same account as user, which is what
    // makeSubname signs with, so this pairing is what makes the two agree.
    const parent = await makeName({ label: 'harness-subname', owner: 'user' })
    const result = await makeSubname({
      parent,
      levels: [{ label: 'a' }, { label: 'b' }],
    })

    expect(
      result.levels.length,
      'makeSubname reported fewer levels than asked for',
    ).toBe(2)

    for (const level of result.levels) {
      // Read each level in the registry the fixture says it lives in — not in
      // the .eth registry, which is where a mis-wired subregistry would leave
      // it and where a lazier check would still find something.
      expect(
        await status(level.registryAddress, level.label),
        `makeSubname reported ${level.name} in ${level.registryAddress} but that registry does not report it registered`,
      ).toBe(REGISTERED)

      expect(
        (await owner(level.registryAddress, level.label)).toLowerCase(),
        `${level.name} is owned by an address other than the one makeSubname reported`,
      ).toBe(level.owner.toLowerCase())

      // A level that claims a subregistry must actually have one attached —
      // otherwise the next level down is created into the void.
      if (level.subregistryAddress) {
        expect(
          (await subregistry(level.registryAddress, level.label)).toLowerCase(),
          `${level.name} claims subregistry ${level.subregistryAddress} but the parent registry points elsewhere`,
        ).toBe(level.subregistryAddress.toLowerCase())
      }
    }

    // The deepest level's owner must hold real roles on it, or every
    // authorization negative built on this fixture is testing nothing.
    const deepest = result.levels[result.levels.length - 1]
    const { raw } = await readNameRoles(
      { label: deepest.label, registryAddress: deepest.registryAddress },
      deepest.owner,
    )
    expect(
      raw,
      `${deepest.name}'s owner holds an empty role bitmap — makeSubname created the name but granted nothing`,
    ).toBeGreaterThan(0n)
  })

  // ── wallets ────────────────────────────────────────────────────────────

  test('wallets: every participant is a distinct, funded account, and the app agrees on who is connected', async ({
    portalPage: page,
    wallet,
    accounts,
    wallets,
  }) => {
    const participants = ['owner', 'manager', 'stranger'] as const

    const addresses = participants.map((p) => wallets.account(p).address)
    expect(
      new Set(addresses.map((a) => a.toLowerCase())).size,
      'two participants resolve to the same address — every authorization negative built on this is vacuous',
    ).toBe(participants.length)

    for (const [i, address] of addresses.entries()) {
      const balance = await publicClient.getBalance({ address })
      expect(
        balance,
        `${participants[i]} (${address}) has no ETH — it cannot sign anything, so a test using it fails for the wrong reason`,
      ).toBeGreaterThan(0n)
    }

    // Rule 6 for this fixture: the *app's* notion of the connected account has
    // to match the harness's. A mismatch here makes every owner-gated
    // assertion downstream meaningless.
    await connectWithHeadlessWallet(page, wallet)

    // The header truncates to `0xf39…266` — five leading characters, a U+2026
    // ellipsis, three trailing. Matching a four-character prefix finds nothing,
    // because only three hex digits survive the truncation.
    //
    // Text is the right oracle *here*, unusually: which account the app
    // believes is connected is UI state, not chain state, so there is no higher
    // oracle to prefer (§4).
    const connected = accounts.getAddress('user')
    const truncated = `${connected.slice(0, 5)}…${connected.slice(-3)}`
    await expect(
      page.getByText(truncated, { exact: false }).first(),
      `the portal does not show ${truncated} as connected — the wallet fixture injected a different account than the app is using`,
    ).toBeVisible({ timeout: 30_000 })
  })

  // ── chain-snapshot ─────────────────────────────────────────────────────

  test('chain-snapshot: revert actually undoes a write', async ({
    makeName,
  }) => {
    // If revert silently no-ops, tests leak state into each other and the
    // failures land in whichever test happens to run next — the most expensive
    // kind of flake to chase.
    const before = await takeSnapshot()
    const name = await makeName({ label: 'harness-snapshot', owner: 'user' })
    const label = labelOf(name)
    expect(await status(ETH_REGISTRY, label)).toBe(REGISTERED)

    await revertTo(before)

    expect(
      await status(ETH_REGISTRY, label),
      'evm_revert did not undo the registration — snapshots are not isolating tests',
    ).not.toBe(REGISTERED)
  })

  // ── time ───────────────────────────────────────────────────────────────

  test('time: the browser clock and block.timestamp move together', async ({
    portalPage: page,
    time,
  }) => {
    // Rule 8. A browser clock that disagrees with block.timestamp produces
    // failures that look exactly like app bugs — a name the chain considers
    // active rendering as expired, and vice versa.
    const jump = 60 * 60 * 24 * 30

    // Snapshot first: `increaseTime` is permanent, and this project is a
    // *dependency* of the real suite, so an unreverted jump would push the
    // shared fork clock forward by 30 days on every single run — a state leak
    // out of the gate and into everything it is supposed to be protecting.
    const before = await takeSnapshot()

    await time.sync()
    const chainBefore = Number((await publicClient.getBlock()).timestamp)
    const pageBefore = await page.evaluate(() => Math.floor(Date.now() / 1000))
    expect(
      Math.abs(chainBefore - pageBefore),
      'the page clock and the chain clock disagree immediately after time.sync()',
    ).toBeLessThan(120)

    await time.increaseTime({ seconds: jump })
    await time.sync()

    const chainAfter = Number((await publicClient.getBlock()).timestamp)
    const pageAfter = await page.evaluate(() => Math.floor(Date.now() / 1000))

    expect(
      chainAfter - chainBefore,
      'increaseTime did not advance block.timestamp by the requested amount',
    ).toBeGreaterThanOrEqual(jump)
    expect(
      Math.abs(chainAfter - pageAfter),
      'the page clock did not follow the chain clock across a time jump — anything time-dependent will fail as if it were an app bug',
    ).toBeLessThan(120)

    // Put the clock back. Asserted, not assumed: a revert that silently failed
    // would leak the jump anyway, and the whole point of this test is that
    // silent clock drift is indistinguishable from an app bug downstream.
    await revertTo(before)
    const restored = Number((await publicClient.getBlock()).timestamp)
    expect(
      Math.abs(restored - chainBefore),
      'the time test did not restore the chain clock — it is leaking 30 days per run into every suite that depends on it',
    ).toBeLessThan(120)
  })

  // ── panoptes (goal §6 B0) ──────────────────────────────────────────────

  test('panoptes: the indexer is watching the contracts the apps actually talk to', async () => {
    // B0, as an assertion rather than a comment. A misconfigured-but-running
    // indexer answers HTTP 200 with zero rows and the UI renders that as a
    // confident negative — the single most expensive failure mode available
    // here, and one that has already shipped once.
    const bad = manifestMismatches()
    expect(
      bad,
      `Panoptes is indexing contracts the apps do not talk to:\n${bad
        .map(
          (m) => `  ${m.manifestKey}: manifest=${m.manifest} ensjs=${m.ensjs}`,
        )
        .join('\n')}`,
    ).toEqual([])
  })

  test('panoptes: it is reachable, synced, and distinguishes empty from broken', async () => {
    expect(
      await isReachable(),
      `Panoptes did not answer at ${PANOPTES_URL} — every indexer-backed oracle in the suite is inert`,
    ).toBe(true)

    // Synced to something recent. An indexer parked far behind the chain head
    // returns real-looking rows for a stale world.
    const indexed = await newestIndexedBlock()
    expect(
      indexed,
      'Panoptes holds no events at all — it is running but has indexed nothing',
    ).not.toBeNull()
    const head = Number(await publicClient.getBlockNumber())
    expect(
      head - (indexed ?? 0),
      `Panoptes is ${head - (indexed ?? 0)} blocks behind the chain head (${head})`,
    ).toBeLessThan(50_000)

    // The property that makes this fixture an oracle rather than scenery: a
    // bad query must *throw*, never come back as an innocent empty result.
    // Without this, "no rows" and "the indexer is broken" are the same value
    // and INV4 cannot be checked at all.
    //
    // Panoptes itself does NOT give us this — measured 2026-08-12, it answers
    // an unknown field with HTTP 200, no errors array, and a null field value.
    // The guard lives in fixtures/panoptes.ts, and this asserts the guard.
    await expect(
      query('{ thisFieldDoesNotExist { id } }'),
      'the unknown-field guard is not firing — this fixture cannot tell an empty result from a broken one, so it is unusable as an oracle',
    ).rejects.toThrow(/does not reject unknown fields|resolved .* to null/i)
  })

  test('panoptes: an unrecognised query argument is caught before it silently unfilters a result set', async () => {
    // The nastier half of the same defect. Panoptes silently ignores arguments
    // it does not recognise: `events(bogusArg: 1, first: 1)` returned ten-plus
    // rows, so the unknown argument was dropped *and took `first` with it*. A
    // `where:` clause it does not understand is ignored the same way, so a
    // filtered query quietly returns the unfiltered set — every assertion over
    // it then passes or fails for reasons unrelated to what it claims to test.
    //
    // `assertQueryFields` introspects the real schema, which is the only way to
    // find out, since the server will never say no.
    await expect(
      assertQueryFields('events', ['bogusArg']),
      'assertQueryFields accepted an argument Panoptes does not have — filtered queries can silently return unfiltered data',
    ).rejects.toThrow(/does not accept/i)

    await expect(
      assertQueryFields('thisFieldDoesNotExist'),
      'assertQueryFields accepted a query-root field that does not exist',
    ).rejects.toThrow(/no query-root field/i)

    // And it must accept the real thing, or it is just a thing that always
    // throws — which would be its own kind of useless.
    await assertQueryFields('events', ['first'])
  })

  // ── the chain itself ───────────────────────────────────────────────────

  test('anvil: the fork is a fork, and the .eth registry is deployed on it', async () => {
    // B0's cheapest half. A misconfigured chain fails every fixture above in a
    // way that reads as many unrelated bugs.
    const block = await publicClient.getBlockNumber()
    expect(block, 'anvil is at block 0 — this is not a fork').toBeGreaterThan(
      1_000_000n,
    )

    const code = await publicClient.getBytecode({ address: ETH_REGISTRY })
    expect(
      code,
      `nothing is deployed at the .eth registry address ${ETH_REGISTRY} that the apps' own config points at`,
    ).toBeTruthy()
    expect(code).not.toBe('0x')

    // testClient must actually be able to drive the chain, or every time and
    // snapshot fixture is inert.
    const auto = await testClient.getAutomine()
    expect(typeof auto, 'testClient cannot reach anvil').toBe('boolean')
  })
})
