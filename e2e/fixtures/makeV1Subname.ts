import {
  type Address,
  encodeFunctionData,
  type Hash,
  namehash,
  parseAbi,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'

import { publicClient, walletClient } from '../helpers/anvil-client.js'
import { V1_NAME_WRAPPER } from './makeV1Name.js'

// ---------------------------------------------------------------------------
// Parent-controlled fuse constants (bits 16-17)
// ---------------------------------------------------------------------------
// PARENT_CANNOT_CONTROL emancipates the child; the parent can no longer burn fuses or reclaim it.
export const PARENT_CANNOT_CONTROL = 1 << 16
export const IS_DOT_ETH = 1 << 17
const CANNOT_UNWRAP = 1

/**
 * The three child fuse sets that decide which migration route a subname takes.
 * Named rather than open-coded because the arithmetic reads identically for
 * cases with completely different outcomes.
 *
 * - `UNLOCKED_CHILD`  no fuses at all. Under an unwrapped or unlocked 2LD this
 *   is `copy` / `unlocked-child` — the name is re-created in a UserRegistry.
 *   PARENT_CANNOT_CONTROL cannot be burned here even if you wanted to: the
 *   NameWrapper refuses unless the parent has CANNOT_UNWRAP.
 * - `EMANCIPATED`     PCC only. Under a LOCKED parent this is `detached-child`
 *   (a token migration via the parent's WrapperRegistry).
 * - `LOCKED_CHILD`    PCC + CANNOT_UNWRAP — `locked-child`, also a token
 *   migration. Requires a locked parent.
 */
export const CHILD_FUSES = {
  UNLOCKED_CHILD: 0,
  EMANCIPATED: PARENT_CANNOT_CONTROL,
  LOCKED_CHILD: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
} as const

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------
const NAME_WRAPPER_ABI = parseAbi([
  'function setSubnodeOwner(bytes32 parentNode, string label, address owner, uint32 fuses, uint64 expiry) returns (bytes32)',
  'function getData(uint256 tokenId) view returns (address owner, uint32 fuses, uint64 expiry)',
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type V1SubnameConfig = {
  /**
   * The parent's name minus `.eth`. Dotted paths are supported (`sub.alice`),
   * so a grandchild can be created.
   */
  parentName: string
  childLabel: string
  ownerAddress: Address
  ownerAccount?: ReturnType<typeof privateKeyToAccount>
  parentOwnerAccount: ReturnType<typeof privateKeyToAccount>
  /**
   * The FULL fuse bitmap written to the child. Nothing is OR'd in implicitly —
   * see `CHILD_FUSES` for the three sets that matter.
   *
   * This used to hardcode `PARENT_CANNOT_CONTROL`, which made the one shape the
   * copy path needs (no fuses, under an unlocked parent) impossible to create:
   * the NameWrapper reverts when PCC is burned under a parent lacking
   * CANNOT_UNWRAP, and the old `waitForTx` here did not check `receipt.status`,
   * so it reverted silently and the name simply never appeared.
   */
  fuses?: number
  /** Absolute expiry in unix seconds. Set in the past for `expired-registration`. */
  expiry?: bigint
  expiryOffset?: number
}

/**
 * The expiry the NameWrapper actually holds for `fullName`.
 *
 * Any test that migrates a COPY under a wrapped parent must pass this into the
 * subgraph mock rather than computing it. Two reasons it cannot be guessed:
 * a wrapped `.eth` 2LD's wrapper expiry is the registrar expiry plus a 90-day
 * grace period, and the registrar expiry itself comes from the block timestamp
 * at registration. The app re-reads this value and compares it exactly with
 * what the subgraph reported, failing the migration with `source-expiry-changed`
 * on any disagreement.
 */
export async function readWrapperExpiry(fullName: string): Promise<bigint> {
  const [, , expiry] = await publicClient.readContract({
    address: V1_NAME_WRAPPER,
    abi: NAME_WRAPPER_ABI,
    functionName: 'getData',
    args: [BigInt(namehash(fullName))],
  })
  return expiry
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function waitForTx(hash: Hash, what: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`[makeV1Subname] ${what} reverted (tx ${hash})`)
  }
  return receipt
}

// ---------------------------------------------------------------------------
// makeV1Subname
// ---------------------------------------------------------------------------
export async function makeV1Subname(config: V1SubnameConfig): Promise<string> {
  const {
    parentName,
    childLabel,
    ownerAddress,
    parentOwnerAccount,
    fuses = CHILD_FUSES.UNLOCKED_CHILD,
    expiryOffset = 365 * 24 * 60 * 60,
  } = config

  const parentNode = namehash(`${parentName}.eth`)
  const childName = `${childLabel}.${parentName}.eth`
  const expiry =
    config.expiry ?? BigInt(Math.floor(Date.now() / 1000) + expiryOffset)

  console.log(
    `[makeV1Subname] creating ${childName} (fuses=0x${fuses.toString(16)}, expiry=${expiry})`,
  )

  const hash = await walletClient.sendTransaction({
    account: parentOwnerAccount,
    to: V1_NAME_WRAPPER,
    data: encodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      functionName: 'setSubnodeOwner',
      args: [parentNode, childLabel, ownerAddress, fuses, expiry],
    }),
  })
  await waitForTx(hash, `setSubnodeOwner(${childName})`)

  // Rule 5 — read back what the fixture claims it made. Two things can go wrong
  // here without the transaction reverting, and both look downstream like "the
  // name is not in the migration list" rather than like a broken fixture:
  //
  //  - the NameWrapper CLAMPS a subnode's expiry to its parent's, so an expiry
  //    past the parent's silently becomes the parent's;
  //  - `preflightChecks` treats a copy whose wrapper expiry is <= now as
  //    unavailable, so a clamped-to-zero expiry makes the name vanish.
  const [actualOwner, actualFuses, actualExpiry] =
    await publicClient.readContract({
      address: V1_NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getData',
      args: [BigInt(namehash(childName))],
    })
  if (actualOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error(
      `[makeV1Subname] ${childName} reports owner ${actualOwner}, expected ${ownerAddress}`,
    )
  }
  if (actualFuses !== fuses) {
    throw new Error(
      `[makeV1Subname] ${childName} reports fuses 0x${actualFuses.toString(16)}, asked for 0x${fuses.toString(16)}. ` +
        `Burning PARENT_CANNOT_CONTROL requires the parent to have CANNOT_UNWRAP burned first.`,
    )
  }

  console.log(
    `[makeV1Subname] ✅ ${childName} (owner: ${ownerAddress}, expiry: ${actualExpiry})`,
  )
  return childName
}
