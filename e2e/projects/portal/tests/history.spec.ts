/**
 * V1 name history — only the name's assigned resolver (WEB-1445, #1210)
 *
 * Bug: the Explorer read a name's V1 resolver events from
 * `resolvers(where: { domain })`. The V1 subgraph creates a `Resolver` row for
 * *any* contract that emits a resolver-shaped event carrying the node, without
 * asking the registry. So anyone could deploy a contract, emit
 * `AddrChanged(node, theirAddress)` or `TextChanged(node, "url", …)`, and have
 * it render as "set address to …" in the name's own history.
 *
 * Fix: read the registry's `NewResolver` events first, fetch resolver rows only
 * for those ids, and keep a resolver event only if its resolver held the name
 * at the event's (block, logIndex).
 *
 * What these reach that the unit tests don't: real logs on the fork, indexed by
 * `packages/v1-subgraph-shim` — which, like the real subgraph, indexes every
 * contract — both GraphQL reads end to end, and what the History page and the
 * Resolver page's scoped history actually render. The interval test uses only
 * honest, owner-authorised PublicResolvers: the filter matters even with no
 * attacker in the picture.
 *
 * Every legitimate record here is written through `OTHER_PUBLIC_RESOLVER`,
 * which local Panoptes does not index. The timeline drops a v1 event whose
 * transaction the v2 feed already carries, so a record written through a
 * Panoptes-indexed resolver would render from Panoptes once it caught up, and
 * stop proving anything about the v1 read.
 *
 * Needs the `v1-subgraph` service. The PR CI service set does not start it, so
 * the suite skips with a reason when the shim is absent or too old to serve the
 * upstream `newResolvers` / `resolverId` fields.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Locator, Page } from '@playwright/test'
import {
  type Address,
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  namehash,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.portal.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const V1_SUBGRAPH_URL =
  process.env.V1_SUBGRAPH_URL ?? 'http://127.0.0.1:5656/subgraph'

const V1_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensLegacyRegistry
  .address as Address
/**
 * A second PublicResolver bound to the canonical registry, so the name's owner
 * is authorised on it (see the resolver notes in `makeV1Name.ts`). It emits the
 * value-bearing `TextChanged(bytes32,string,string,string)`, and local Panoptes
 * does not index it — see the header.
 */
const OTHER_PUBLIC_RESOLVER =
  '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as Address

/**
 * Contracts nobody assigned to any name: minimal emitters planted with
 * `anvil_setCode`. Calldata is `topics ‖ data`, logged verbatim — the shape of
 * an attacker's contract that emits resolver events for a node it doesn't own.
 */
const FORGE_ADDR = '0x00000000000000000000000000000000000a77a2' as Address
const FORGE_TEXT = '0x00000000000000000000000000000000000a77a3' as Address
/** LOG2(calldata[64:], calldata[0:32], calldata[32:64]) */
const LOG2_EMITTER = '0x6040360380604060003760203590600035906000a200'
/** LOG3(calldata[96:], calldata[0:32], calldata[32:64], calldata[64:96]) */
const LOG3_EMITTER = '0x606036038060606000376040359060203590600035906000a300'

/** Renders as `0xbad0…0bad` in the timeline. */
const FORGED_ADDRESS = '0xbad0000000000000000000000000000000000bad' as Address
const FORGED_ADDRESS_SHORT = /0xbad0…0bad/i

const REGISTRY_ABI = parseAbi([
  'function setResolver(bytes32 node, address resolver)',
])
const RESOLVER_ABI = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function setAddr(bytes32 node, address a)',
])

const runId = () => Date.now().toString(36)
const shortAddress = (address: Address) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`.toLowerCase()

const send = async (
  account: PrivateKeyAccount,
  to: Address,
  data: Hex,
): Promise<bigint> => {
  const hash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to,
    data,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  expect(receipt.status, `tx to ${to}`).toBe('success')
  return receipt.blockNumber
}

/** Owner-signed registry and resolver writes for one name. */
const ownerWrites = (owner: PrivateKeyAccount, node: Hex) => ({
  setResolver: (resolver: Address) =>
    send(
      owner,
      V1_REGISTRY,
      encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'setResolver',
        args: [node, resolver],
      }),
    ),
  setText: (resolver: Address, value: string) =>
    send(
      owner,
      resolver,
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setText',
        args: [node, 'url', value],
      }),
    ),
  setAddr: (resolver: Address, address: Address) =>
    send(
      owner,
      resolver,
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setAddr',
        args: [node, address],
      }),
    ),
})

const shim = async <T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data?: T; errors?: { message: string }[] }> => {
  const res = await fetch(V1_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

/** `null` when the shim can serve the fixed read, else why not. */
let shimUnavailable: string | null | undefined
const checkShim = async (): Promise<string | null> => {
  try {
    const { errors } = await shim(
      `query($id: String!) { newResolvers(where: { domain: $id }, first: 1) { id resolverId } }`,
      { id: namehash('eth') },
    )
    return errors
      ? `v1-subgraph shim at ${V1_SUBGRAPH_URL} predates newResolvers/resolverId: ${errors[0]?.message}`
      : null
  } catch (e) {
    return `v1-subgraph shim not reachable at ${V1_SUBGRAPH_URL} (${(e as Error).message})`
  }
}

/** Wait until the shim has indexed `block`, so the page reads what we wrote. */
const waitForShim = async (block: bigint) => {
  await expect
    .poll(
      async () =>
        (
          await shim<{ _meta: { block: { number: number } } }>(
            '{ _meta { block { number } } }',
          )
        ).data?._meta.block.number ?? 0,
      { timeout: 60_000, message: `v1-subgraph shim indexes block ${block}` },
    )
    .toBeGreaterThanOrEqual(Number(block))
}

/** Plant the emitters and forge `AddrChanged` + `TextChanged("url")` for `node`. */
const forgeResolverEvents = async (
  attacker: PrivateKeyAccount,
  node: Hex,
  url: string,
): Promise<bigint> => {
  await testClient.setCode({ address: FORGE_ADDR, bytecode: LOG2_EMITTER })
  await testClient.setCode({ address: FORGE_TEXT, bytecode: LOG3_EMITTER })
  await send(
    attacker,
    FORGE_ADDR,
    concat([
      keccak256(toHex('AddrChanged(bytes32,address)')),
      node,
      encodeAbiParameters([{ type: 'address' }], [FORGED_ADDRESS]),
    ]),
  )
  return send(
    attacker,
    FORGE_TEXT,
    concat([
      keccak256(toHex('TextChanged(bytes32,string,string,string)')),
      node,
      keccak256(toHex('url')),
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }],
        ['url', url],
      ),
    ]),
  )
}

/**
 * Non-vacuity guard: the forged rows really are in the subgraph under this
 * name, so any domain-keyed resolver read would return them. Without this, the
 * page's "not shown" assertions could pass because the forgery never landed.
 */
const expectForgeryIndexed = async (node: Hex) => {
  const { data } = await shim<{
    resolvers: { id: string; events: { __typename: string }[] }[]
    newResolvers: { resolverId: string }[]
  }>(
    `query($id: String!) {
      resolvers(where: { domain: $id }) { id events { __typename } }
      newResolvers(where: { domain: $id }) { resolverId }
    }`,
    { id: node },
  )
  const byAddress = (address: Address) =>
    data?.resolvers.find((r) => r.id.startsWith(address.toLowerCase()))
  expect(
    byAddress(FORGE_ADDR)?.events.map((e) => e.__typename),
    'precondition: the subgraph lists the forged AddrChanged under the name',
  ).toEqual(['AddrChanged'])
  expect(
    byAddress(FORGE_TEXT)?.events.map((e) => e.__typename),
    'precondition: and the forged TextChanged',
  ).toEqual(['TextChanged'])
  expect(
    data?.newResolvers.map((n) => n.resolverId.split('-')[0]),
    'precondition: the registry only ever assigned OTHER_PUBLIC_RESOLVER',
  ).toEqual([OTHER_PUBLIC_RESOLVER.toLowerCase()])
}

/**
 * A timeline row by its accessible name. Matching the value text alone hits two
 * spans per row, one of them hidden; the row name also pins the action and key.
 */
const textRow = (main: Locator, url: string) =>
  main.getByRole('button', { name: `set text record url → ${url}` })

/**
 * Wait for the timeline to show a v1-only resolver record before asserting any
 * absence, and for no partial-load error: a failed v1 read would hide the
 * forged rows and the real ones alike.
 */
const expectTimelineLoaded = async (
  page: Page,
  legitUrl: string,
): Promise<Locator> => {
  const main = page.locator('main')
  await expect(textRow(main, legitUrl)).toBeVisible({
    timeout: 30_000,
  })
  await expect(main.getByText(/couldn't load/i)).toHaveCount(0)
  return main
}

/** A fresh V1 name, owned by `user`, pointed at `OTHER_PUBLIC_RESOLVER` with a `url`. */
const nameWithRecords = async (
  owner: PrivateKeyAccount,
  label: string,
  legitUrl: string,
) => {
  const name = await createMakeV1Name({ userAccount: owner })({ label })
  const node = namehash(name)
  const writes = ownerWrites(owner, node)
  await writes.setResolver(OTHER_PUBLIC_RESOLVER)
  await writes.setText(OTHER_PUBLIC_RESOLVER, legitUrl)
  return { name, node, writes }
}

test.describe('V1 name history shows only the assigned resolver (WEB-1445)', () => {
  test.beforeEach(async () => {
    shimUnavailable ??= await checkShim()
    test.skip(!!shimUnavailable, shimUnavailable ?? '')
  })

  test("History: a contract nobody assigned can't write the name's history", async ({
    page,
    accounts,
  }) => {
    test.setTimeout(180_000)
    const id = runId()
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const attacker = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const legitUrl = `https://legit-${id}.example`
    const forgedUrl = `https://phish-${id}.example`

    const { name, node, writes } = await nameWithRecords(
      owner,
      'v1-hist-forge',
      legitUrl,
    )
    await writes.setAddr(OTHER_PUBLIC_RESOLVER, owner.address)
    await waitForShim(await forgeResolverEvents(attacker, node, forgedUrl))
    await expectForgeryIndexed(node)

    await page.goto(`${PORTAL_APP_URL}/${name}/history`)
    const main = await expectTimelineLoaded(page, legitUrl)

    // Positive control for the address negative below: an AddrChanged from the
    // assigned resolver still renders.
    await expect(
      main.getByRole('button', {
        // The address badge adds its copy / explorer labels to the name.
        name: new RegExp(`^set address to .*${shortAddress(owner.address)}`),
      }),
    ).toBeVisible()

    // The bug: these rendered as the name's own records.
    await expect.soft(main.getByText(forgedUrl, { exact: true })).toHaveCount(0)
    await expect.soft(main.getByText(FORGED_ADDRESS_SHORT)).toHaveCount(0)
  })

  test('Resolver page: the scoped history read drops the forged events too', async ({
    page,
    accounts,
  }) => {
    // The Resolver page scopes the read to resolver event types, which takes
    // the per-collection query shape (`textChangeds`, `addrChangeds`, …)
    // instead of the `events` interface the History page uses.
    test.setTimeout(180_000)
    const id = runId()
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const attacker = privateKeyToAccount(accounts.getPrivateKey('user2'))
    const legitUrl = `https://legit-${id}.example`
    const forgedUrl = `https://phish-${id}.example`

    const { name, node } = await nameWithRecords(
      owner,
      'v1-hist-scoped',
      legitUrl,
    )
    await waitForShim(await forgeResolverEvents(attacker, node, forgedUrl))
    await expectForgeryIndexed(node)

    await page.goto(`${PORTAL_APP_URL}/${name}/resolver`)
    const main = await expectTimelineLoaded(page, legitUrl)

    await expect.soft(main.getByText(forgedUrl, { exact: true })).toHaveCount(0)
    await expect.soft(main.getByText(FORGED_ADDRESS_SHORT)).toHaveCount(0)
  })

  test('History: records count only while their resolver was assigned', async ({
    page,
    accounts,
  }) => {
    // Every write here is by the owner, through a real PublicResolver it is
    // authorised on. What differs is whether the registry pointed the name at
    // that resolver when the write happened.
    test.setTimeout(240_000)
    const id = runId()
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const url = {
      neverAssigned: `https://never-assigned-${id}.example`,
      first: `https://first-interval-${id}.example`,
      movedOff: `https://moved-off-${id}.example`,
      reassigned: `https://reassigned-${id}.example`,
      unset: `https://after-unset-${id}.example`,
    }

    // Registered without records, so the name starts with no resolver at all.
    const name = await createMakeV1Name({ userAccount: owner })({
      label: 'v1-hist-intervals',
    })
    const { setResolver, setText } = ownerWrites(owner, namehash(name))
    const B = OTHER_PUBLIC_RESOLVER

    await setText(B, url.neverAssigned) // before the name ever had a resolver
    await setResolver(B)
    await setText(B, url.first) //         B assigned
    await setResolver(V1_PUBLIC_RESOLVER)
    await setText(B, url.movedOff) //      name moved off B
    await setResolver(B)
    await setText(B, url.reassigned) //    B assigned again
    await setResolver(zeroAddress)
    await waitForShim(await setText(B, url.unset)) // resolver unset

    await page.goto(`${PORTAL_APP_URL}/${name}/history`)
    const main = await expectTimelineLoaded(page, url.reassigned)

    // Positive control: history follows the name across resolver changes —
    // B's first interval still shows after the name moved away and back.
    await expect(textRow(main, url.first)).toBeVisible()

    for (const stray of [url.neverAssigned, url.movedOff, url.unset]) {
      await expect
        .soft(main.getByText(stray, { exact: true }), stray)
        .toHaveCount(0)
    }
  })
})
