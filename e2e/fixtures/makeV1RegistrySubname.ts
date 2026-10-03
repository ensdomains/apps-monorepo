/**
 * Create a V1 subname that exists ONLY in the legacy ENS registry — no
 * NameWrapper token at all.
 *
 * This is the source shape for the `registry-child` copy route added by the
 * subname-migration PR. `classifyName` reaches that branch through
 * `classifyWithoutActiveWrapper`: the domain has no active `wrappedDomain`, its
 * parent is not `eth`, and `domain.owner.id` — the *registry* owner — is the
 * connected wallet. There is no token to transfer, so the name is re-created in
 * V2 rather than migrated, with `sourceExpiry` fixed at `MAX_UINT64`.
 *
 * Two constraints are structural rather than incidental:
 *
 *  1. **The parent must be unwrapped.** A wrapped parent's registry owner is the
 *     NameWrapper, so an EOA's `setSubnodeOwner` reverts. That is the same fact
 *     that makes the `registry-child` branch reachable at all — if the parent
 *     were wrapped, the child would have a wrapper token and take a different
 *     branch entirely.
 *
 *  2. **Leave the resolver unset by default.** `hasSupportedCopyResolver(null)`
 *     is `true`, so a resolver-less registry child is eligible. Passing a
 *     `resolver` that is not in `KNOWN_PUBLIC_RESOLVERS` is precisely how the
 *     `unsupported-resolver` fixture is built — do not set one casually.
 *
 * Note this writes through `ENSRegistry.setResolver`, not through the resolver
 * itself, so it does NOT hit the known `setV1Records` authorisation gap
 * documented in `makeV1Name.ts` (that gap is about writing record *values* to
 * `V1_PUBLIC_RESOLVER`, whose `_ens` is pinned to a superseded registry).
 */
import {
  type Address,
  encodeFunctionData,
  type Hash,
  keccak256,
  namehash,
  parseAbi,
  toHex,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'

import { publicClient, walletClient } from '../helpers/anvil-client.js'
import { V1_ENS_REGISTRY } from './makeV1Name.js'

const REGISTRY_ABI = parseAbi([
  'function setSubnodeOwner(bytes32 node, bytes32 label, address owner) returns (bytes32)',
  'function setResolver(bytes32 node, address resolver)',
  'function owner(bytes32 node) view returns (address)',
])

export type V1RegistrySubnameConfig = {
  /** The parent's name minus `.eth`. Dotted paths supported (`sub.alice`). */
  parentName: string
  childLabel: string
  ownerAddress: Address
  /** Must be the parent's CURRENT registry owner, i.e. an unwrapped parent's EOA. */
  parentOwnerAccount: ReturnType<typeof privateKeyToAccount>
  /** Omit for the eligible case. See the note above before setting this. */
  resolver?: Address
}

async function waitForTx(hash: Hash, what: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`[makeV1RegistrySubname] ${what} reverted (tx ${hash})`)
  }
  return receipt
}

export async function makeV1RegistrySubname(
  config: V1RegistrySubnameConfig,
): Promise<string> {
  const { parentName, childLabel, ownerAddress, parentOwnerAccount, resolver } =
    config

  const parentNode = namehash(`${parentName}.eth`)
  const childName = `${childLabel}.${parentName}.eth`
  const childNode = namehash(childName)

  console.log(`[makeV1RegistrySubname] creating ${childName} (registry-only)`)

  const hash = await walletClient.sendTransaction({
    account: parentOwnerAccount,
    to: V1_ENS_REGISTRY,
    data: encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: 'setSubnodeOwner',
      args: [parentNode, keccak256(toHex(childLabel)), ownerAddress],
    }),
  })
  await waitForTx(hash, `setSubnodeOwner(${childName})`)

  if (resolver) {
    const resolverHash = await walletClient.sendTransaction({
      account: parentOwnerAccount,
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'setResolver',
        args: [childNode, resolver],
      }),
    })
    await waitForTx(resolverHash, `setResolver(${childName})`)
  }

  // Rule 5 — read back the exact call the app makes. `preflightChecks`
  // resolves a `registry-child`'s ownership with `LegacyRegistry.owner(node)`,
  // so asserting it here means the fixture and the app agree by construction
  // rather than by coincidence.
  const actualOwner = await publicClient.readContract({
    address: V1_ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [childNode],
  })
  if (actualOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error(
      `[makeV1RegistrySubname] ${childName} reports registry owner ${actualOwner}, ` +
        `expected ${ownerAddress}. The parent's registry owner must be the sending account — ` +
        `a WRAPPED parent is owned by the NameWrapper and this call cannot work.`,
    )
  }

  console.log(
    `[makeV1RegistrySubname] ✅ ${childName} (registry owner: ${ownerAddress})`,
  )
  return childName
}
