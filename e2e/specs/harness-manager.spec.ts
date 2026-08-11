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
 * - `test.skip()`  — blocked-env, with an owner and a date. The manager's
 *   connect flow is unavailable in this environment, which blocks the whole
 *   `manager-e2e` project and not just this file. See the comment at the site.
 *
 * Neither is a weakened assertion; both keep the original oracle intact.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { type Address, parseAbi, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { revertTo, takeSnapshot } from '../fixtures/chain-snapshot.js'
import { createMakeV1Name, V1_BASE_REGISTRAR } from '../fixtures/makeV1Name.js'
import { expect, test } from '../fixtures/playwright.manager.fixture.js'
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

  test('makeV2Name: rule 5 — the name it reports is registered in the .eth registry, owned by somebody', async ({
    makeV2Name,
  }) => {
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

  // `test.skip` in its *static* form, not `test.skip(true, …)` inside the body:
  // `connectedPage` is a fixture, and fixtures resolve before the body runs, so
  // an in-body skip is reached only after the connect helper has already
  // thrown. The reason lives in the comment below because the static form takes
  // no message argument.
  test.skip('makeV2Name: rule 6 — the manager renders the name it made', async ({
    connectedPage: page,
    makeV2Name,
  }) => {
    // blocked-env — owner: sugh01, expires 2026-08-19.
    //
    // Not a fault in this test or in makeV2Name. `connectWithHeadlessWallet`
    // (helpers/manager-auth.ts:92) waits for a Connect button that the manager
    // does not render with `VITE_FF_USE_EOA=false` in `apps/manager/.env` —
    // Para-embedded has no wagmi client for the headless provider to attach to.
    //
    // Verified 2026-08-12 that this blocks the *whole* manager project, not
    // just this spec: `profile.spec.ts:113 "shows validation errors for invalid
    // records"` fails at the identical line under `--no-deps`. So every
    // manager-side rule-6 check is blocked until the env is settled, and that
    // decision is the owner's — flipping the flag restarts their dev server and
    // changes which wallet path the app runs.
    //
    // Skipped rather than deleted so the assertion survives the blockage, and
    // rather than left red so the gate can still protect everything else.
    const name = await makeV2Name({ label: 'harness-v2-visible' })
    await page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(
      page.getByText(name, { exact: true }).first(),
      `${name} is registered on chain but the manager's profile page does not render it`,
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
    // KNOWN BROKEN — this is the blocker on all 61 G* rows.
    //
    // `makeV1Name` registers into V1_BASE_REGISTRAR (0x64096092…) while the
    // migration code resolves `ensBaseRegistrarImplementation` through ensjs
    // (0x57f1887a…). Both are deployed on the fork, so registration succeeds
    // and every name is invisible to the app. Specs paper over it by
    // route-mocking the V1 subgraph, which is why the suite above it stayed
    // green — the mock answers for a name the chain-reading half cannot find.
    //
    // Marked `fail` rather than skipped so it is *executed* every run and this
    // annotation cannot outlive the bug: fix the fixture and this goes red with
    // "expected to fail but passed". At that point delete the annotation and
    // unblock the G* matrix.
    //
    // Not weakening the assertion — the assertion below is the correct one and
    // is unchanged. Only its expected outcome is recorded as currently-failing.
    test.fail()

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

  test('the two V1 registrars are genuinely different deployments, both live', async () => {
    // Guards the premise of the test above. If these ever became the same
    // address, the rule-6 failure would be about something else entirely and
    // the diagnosis above would silently become wrong.
    expect(
      V1_BASE_REGISTRAR.toLowerCase(),
      'makeV1Name and the app now point at the same V1 registrar — re-read the rule-6 test above, its explanation no longer applies',
    ).not.toBe(APP_V1_BASE_REGISTRAR.toLowerCase())

    for (const [label, address] of [
      ['fixture', V1_BASE_REGISTRAR],
      ['app', APP_V1_BASE_REGISTRAR],
    ] as const) {
      const code = await publicClient.getBytecode({ address })
      expect(
        code && code !== '0x',
        `the ${label} V1 registrar ${address} has no bytecode — the fork is not what this suite assumes`,
      ).toBeTruthy()
    }
  })
})
