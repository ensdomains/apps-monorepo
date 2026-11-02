/**
 * #1494 subname recreation, shared by the manager and portal specs.
 *
 * `recreateTree` drives the manager's real `/upgrade` flow with the
 * `migration-subname-recreation` flag on, so the V2 state the portal specs
 * read is what the product writes, not a hand-built approximation of it.
 *
 * V1 children are created by the parent's registry owner and then configured
 * by their OWN holder, as on mainnet: a parent cannot set a resolver on a node
 * it no longer owns.
 */
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  labelhash,
  namehash,
  parseAbi,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'
import { V1_ENS_REGISTRY, V1_PUBLIC_RESOLVER } from '../fixtures/makeV1Name.js'
import {
  connectHeadless,
  overrideManagerFeatureFlags,
  waitForManagerFeatureFlagOverride,
} from '../fixtures/playwright.manager.fixture.js'
import { setV1RecordsOn, type V1Records } from '../fixtures/v1-records.js'
import { publicClient, testClient, walletClient } from './anvil-client.js'
import { dismissBackendAuthModal } from './manager-auth.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  selectOnlyRoots,
} from './migration-flow.js'
import { mockSubnameInventory } from './mock-subname-inventory.js'
import { serveV1Names } from './v1-names.js'
import { v1Expiry } from './v2-reads.js'

export type Signer = ReturnType<typeof privateKeyToAccount>

const LEGACY_REGISTRY_ABI = parseAbi([
  'function setSubnodeOwner(bytes32 node, bytes32 label, address owner) returns (bytes32)',
  'function setResolver(bytes32 node, address resolver)',
])

/**
 * Anvil's well-known accounts carry leftover contract code on the Sepolia
 * fork, so ERC-1155 mints to them fail the receiver check. Make them plain
 * EOAs, as the manager fixture does for account 0.
 */
export async function asPlainEoas(...accounts: readonly Signer[]) {
  for (const account of accounts)
    await testClient.setCode({ address: account.address, bytecode: '0x' })
}

export async function send(
  account: Signer,
  to: Address,
  data: Hex,
  what: string,
) {
  const hash = await walletClient.sendTransaction({ account, to, data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success')
    throw new Error(`${what} reverted (${hash})`)
}

/** A registry-only `child.parent` owned by `holder`, with the holder's resolver and records. */
export async function registryChild(params: {
  readonly parent: string
  readonly label: string
  readonly parentOwner: Signer
  readonly holder: Signer
  readonly resolver?: Address
  readonly records?: V1Records
}): Promise<string> {
  const name = `${params.label}.${params.parent}`
  await send(
    params.parentOwner,
    V1_ENS_REGISTRY,
    encodeFunctionData({
      abi: LEGACY_REGISTRY_ABI,
      functionName: 'setSubnodeOwner',
      args: [
        namehash(params.parent),
        labelhash(params.label),
        params.holder.address,
      ],
    }),
    `setSubnodeOwner(${name})`,
  )
  if (params.records)
    await setV1RecordsOn(name, params.holder, false, params.records, {
      resolver: params.resolver ?? V1_PUBLIC_RESOLVER,
    })
  else if (params.resolver)
    await send(
      params.holder,
      V1_ENS_REGISTRY,
      encodeFunctionData({
        abi: LEGACY_REGISTRY_ABI,
        functionName: 'setResolver',
        args: [namehash(name), params.resolver],
      }),
      `setResolver(${name})`,
    )
  return name
}

/** Connect the manager with `migration` on and the recreation flag pinned either way. */
export async function connectWithFlags(
  page: Page,
  wallet: Web3ProviderBackend,
  flags: { readonly recreation: boolean },
): Promise<void> {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.log(`[browser ${message.type()}] ${message.text().slice(0, 600)}`)
  })
  await overrideManagerFeatureFlags(page, {
    migration: true,
    'profile-view-new': true,
    'migration-subname-recreation': flags.recreation,
  })
  await connectHeadless(page, wallet)
  await dismissBackendAuthModal(page)
  await waitForManagerFeatureFlagOverride(page)
}

/**
 * Upgrade `parent` (owned by `owner`, the connected wallet) and recreate its
 * direct `children` through the manager UI.
 */
export async function recreateTree(params: {
  readonly page: Page
  readonly wallet: Web3ProviderBackend
  readonly owner: Signer
  readonly parent: string
  readonly children: readonly string[]
}): Promise<void> {
  const { page, wallet, owner, parent, children } = params
  await serveV1Names(page, [
    {
      name: parent,
      ownerAddress: owner.address,
      expiryDate: await v1Expiry(parent.replace(/\.eth$/, '')),
    },
  ])
  await mockSubnameInventory(page, [
    { name: parent, children: children.map((name) => ({ name })) },
  ])
  await connectWithFlags(page, wallet, { recreation: true })
  await openMigrationFlow(page)
  await selectOnlyRoots(page, [parent])
  await confirmAndAuthorize(page, wallet)
}
