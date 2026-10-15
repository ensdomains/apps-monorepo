/**
 * Harness integrity gate — manager side. Companion to `harness.spec.ts`.
 *
 * Same contract as its portal sibling: the subject is the fixtures, rule 5 is
 * "read the postcondition back independently", rule 6 is "and the app can see
 * it through the path the app actually reads".
 *
 * This file exists mainly for one fixture. `makeV1Name` is the reason rule 6 is
 * in the goal document at all — it registers names into a V1 deployment the
 * migration code never queries, so registration succeeds, nothing errors, and
 * every name it makes is invisible to the app under test. That was live for
 * weeks with a green suite over it, and it is the standing blocker on all 61
 * `G*` migration rows.
 *
 * The fault is not a mystery any more, so this file encodes it precisely rather
 * than describing it: `makeV1Name`'s rule-6 check is `test.fail()`. It passes
 * while the fixture is broken and **goes red the moment someone fixes it** —
 * exactly when a human needs to look, because that is when 61 scenarios unblock
 * and the annotation has to come off.
 *
 * Two annotations here, and they mean different things:
 *
 * - `test.fail()` — the assertion is correct and currently fails, deliberately.
 *   The test still *runs*, so it cannot rot.
 * `test.fail()` is not a weakened assertion — it keeps the original oracle and
 * records only that its current outcome is failure.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { type Address, parseAbi, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { revertTo, takeSnapshot } from '../fixtures/chain-snapshot.js'
import { createMakeV1Name, V1_BASE_REGISTRAR } from '../fixtures/makeV1Name.js'
import { expect, test } from '../fixtures/playwright.manager.fixture.js'
import {
  APP_V1_CONTROLLER,
  APP_V1_NAME_WRAPPER,
  ensureV1ControllersAuthorised,
  v1ControllerAuthState,
} from '../fixtures/v1-controller-auth.js'
import { publicClient } from '../helpers/anvil-client.js'
import { ETH_REGISTRY } from '../helpers/role-assertions.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

/**
 * The V1 BaseRegistrar the *app* reads, from the same config the app reads it
 * from — `apps/manager/src/features/migration/contracts/addresses.ts` and
 * `packages/migration/src/service/preflightChecks.ts` both resolve
 * `ensBaseRegistrarImplementation` through ensjs.
 *
 * `V1_BASE_REGISTRAR`, which `makeV1Name` writes to, is a different, superseded
 * deployment that is also live on the fork. Both answer; only one is read.
 */
const APP_V1_BASE_REGISTRAR = ensjsSepolia.ensBaseRegistrarImplementation
  .address as Address

const ERC721_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
])

const REGISTRY_ABI = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function ownerOf(uint256 id) view returns (address)',
])

/** `PermissionedRegistry.getStatus` — 0 available, 1 reserved, 2 registered. */
const REGISTERED = 2

const labelOf = (name: string) => name.replace(/\.eth$/, '')

const v1TokenId = async (label: string) => {
  const { keccak256, toHex } = await import('viem')
  return BigInt(keccak256(toHex(label)))
}

/** ERC-721 `ownerOf`, or `null` when the token does not exist (the call reverts). */
async function erc721Owner(
  registrar: Address,
  label: string,
): Promise<Address | null> {
  try {
    return (await publicClient.readContract({
      address: registrar,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [await v1TokenId(label)],
    })) as Address
  } catch {
    // A revert here is the answer, not an error: BaseRegistrar reverts on an
    // unregistered token, which is precisely the "invisible to the app" state.
    return null
  }
}

test.describe('Harness integrity — manager', () => {
  test.describe.configure({ timeout: 300_000 })

  // ── makeV2Name ─────────────────────────────────────────────────────────

  test('makeV2Name: rule 5 — the name it reports is registered in the .eth registry, owned by somebody', {
    tag: ['@smoke'],
  }, async ({ makeV2Name }) => {
    const name = await makeV2Name({ label: 'harness-v2' })
    const label = labelOf(name)

    // Rule 5, read independently of the fixture's return value.
    expect(
      await publicClient.readContract({
        address: ETH_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'getStatus',
        args: [await v1TokenId(label)],
      }),
      `makeV2Name returned ${name} but the .eth registry does not report it registered`,
    ).toBe(REGISTERED)

    // `ownerOf` needs the canonical (version-bearing) id — the bare labelhash
    // returns the zero address for a healthy name. See harness.spec.ts.
    const onChainOwner = (await publicClient.readContract({
      address: ETH_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [labelToCanonicalId(label)],
    })) as Address
    expect(
      onChainOwner.toLowerCase(),
      'makeV2Name produced a name owned by nobody',
    ).not.toBe(zeroAddress)
  })

  test('makeV2Name: rule 6 — the manager renders the name it made', {
    tag: ['@smoke'],
  }, async ({ connectedPage: page, makeV2Name, accounts }) => {
    // Un-skipped 2026-08-12. This was blocked-env: `connectWithHeadlessWallet`
    // waited for a Connect button the manager did not render, because
    // `apps/manager/.env` had lost its local-dev values. Restored by the repo
    // owner; the blockage is gone and the assertion is live again.
    // Owned by `other` (user2) — deliberately NOT the connected wallet.
    //
    // If the name were owned by the connected account, finding its address on
    // the page would prove nothing: the header renders the connected wallet
    // regardless of what the app knows about the name. Using a third-party
    // owner makes the address something the app can only have learned by
    // reading this name's owner off the chain.
    const name = await makeV2Name({
      label: 'harness-v2-visible',
      owner: 'other',
    })
    const ownerAddress = accounts.getAddress('user2')
    await page.goto(`${MANAGER_APP_URL}/${name}`)

    // The manager truncates with three ASCII periods (`0xf39F...2266`), not a
    // U+2026 ellipsis like the portal. Matching either, and the full address,
    // so this asserts what the app knows rather than how it currently formats.
    const head = ownerAddress.slice(0, 6)
    const tail = ownerAddress.slice(-4)
    await expect(
      page
        .getByText(
          new RegExp(
            `${head}(\\.\\.\\.|…|${ownerAddress.slice(6, -4)})${tail}`,
            'i',
          ),
        )
        .first(),
      `the manager does not show ${head}...${tail} — user2, who owns ${name} — anywhere on its profile page. Either makeV2Name wrote somewhere the app does not read, or the app is not pointed at this chain.`,
    ).toBeVisible({ timeout: 30_000 })
  })

  // ── makeV1Name ─────────────────────────────────────────────────────────

  test('makeV1Name: rule 5 — the name really is registered in the registrar the fixture targets', async ({
    accounts,
  }) => {
    // Snapshotted: V1 registration is a permanent write to the shared fork, and
    // this file is a project dependency. See harness.spec.ts on clock leaks.
    const before = await takeSnapshot()
    try {
      const makeV1Name = createMakeV1Name({
        userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
      })
      const name = await makeV1Name({ label: 'harness-v1-rule5' })
      const label = labelOf(name)

      const owner = await erc721Owner(V1_BASE_REGISTRAR, label)
      expect(
        owner,
        `makeV1Name reported ${name} but ${V1_BASE_REGISTRAR} — the registrar it writes to — does not own it. The fixture is not doing what it claims at all, which is a different and worse fault than the known one below.`,
      ).not.toBeNull()
      expect(owner?.toLowerCase()).toBe(
        accounts.getAddress('user').toLowerCase(),
      )
    } finally {
      await revertTo(before)
    }
  })

  test('makeV1Name: rule 6 — the name is visible in the registrar the app reads', async ({
    accounts,
  }) => {
    // FIXED — iteration 23. `makeV1Name` used to register into a fixture-only
    // V1 deployment while the migration code resolved
    // `ensBaseRegistrarImplementation` through ensjs — same code, twice
    // deployed on the fork, so registration succeeded into a registrar the
    // app could never see. `V1_BASE_REGISTRAR` is now imported from
    // `v1-controller-auth.ts`'s `APP_V1_BASE_REGISTRAR` (the ruling from
    // iteration 14: repoint all four V1 constants at once), so this
    // assertion — unchanged since it was written, per rule 1 — passes for
    // real instead of via `test.fail()`. That flip ("expected to fail but
    // passed") was the signal iteration 4 designed this test to produce; this
    // is that moment, and the annotation is gone.
    const before = await takeSnapshot()
    try {
      const makeV1Name = createMakeV1Name({
        userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
      })
      const name = await makeV1Name({ label: 'harness-v1-rule6' })
      const label = labelOf(name)

      const owner = await erc721Owner(APP_V1_BASE_REGISTRAR, label)
      expect(
        owner,
        `${name} is not present in ${APP_V1_BASE_REGISTRAR}, the V1 BaseRegistrar the migration code actually reads — so the app cannot see any name this fixture makes`,
      ).not.toBeNull()
    } finally {
      await revertTo(before)
    }
  })

  test('v1-controller-auth: both grants land on the canonical registrar, and are idempotent', async () => {
    // The precondition for repointing `makeV1Name` at the deployment the app
    // reads. Iteration 13 proved the grant works but did it from a probe, which
    // mutated one long-lived fork and would not survive `infra:up` or reach CI.
    // This asserts the reproducible version.
    //
    // Snapshot/revert around it so the run leaves the fork as it found it —
    // otherwise this test would itself become the untracked state mutation it
    // exists to replace.
    const before = await takeSnapshot()
    try {
      await ensureV1ControllersAuthorised()
      const first = await v1ControllerAuthState()
      expect(
        first.controller,
        `${APP_V1_BASE_REGISTRAR}.controllers(${APP_V1_CONTROLLER}) is still false after ensureV1ControllersAuthorised() — register on the canonical controller will keep reverting inside onlyController with no revert data`,
      ).toBe(true)
      expect(
        first.nameWrapper,
        `${APP_V1_BASE_REGISTRAR}.controllers(${APP_V1_NAME_WRAPPER}) is still false — unwrapped names would work but wrapETH2LD would not, so every wrapped and locked G* row stays unreachable`,
      ).toBe(true)

      // Idempotent: a second call must be a no-op, not a second grant or a
      // revert. Fixtures call this per name, so it runs many times per run.
      await ensureV1ControllersAuthorised()
      expect(await v1ControllerAuthState()).toEqual(first)
    } finally {
      await revertTo(before)
    }
  })

  test('makeV1Name and the app read the same V1 registrar', async () => {
    // Replaces the pre-iteration-23 "the two V1 registrars are genuinely
    // different deployments" test, which guarded the *old*, now-fixed
    // mismatch — it would have failed forever after the repoint, for a
    // reason with nothing to do with a regression. This guards the opposite,
    // current invariant: if `V1_BASE_REGISTRAR` and `APP_V1_BASE_REGISTRAR`
    // ever diverge again (e.g. someone edits one without the other), rule 6
    // above goes back to failing for the old reason, silently, unless
    // something here calls it out directly.
    expect(
      V1_BASE_REGISTRAR.toLowerCase(),
      'makeV1Name and the app now point at different V1 registrars — the iteration 23 repoint has regressed, and rule 6 above will start failing for the pre-iteration-23 reason',
    ).toBe(APP_V1_BASE_REGISTRAR.toLowerCase())

    const code = await publicClient.getBytecode({ address: V1_BASE_REGISTRAR })
    expect(
      code && code !== '0x',
      `the V1 registrar ${V1_BASE_REGISTRAR} has no bytecode — the fork is not what this suite assumes`,
    ).toBeTruthy()
  })
})
