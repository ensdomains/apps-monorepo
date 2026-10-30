import {
  type Address,
  encodeFunctionData,
  type Hash,
  labelhash,
  namehash,
  parseAbi,
  stringToBytes,
  toHex,
  zeroAddress,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'
import { publicClient, walletClient } from '../helpers/anvil-client.js'
import { localReceipt } from '../helpers/local-receipt.js'
import { V1_ENS_REGISTRY, V1_NAME_WRAPPER } from './makeV1Name.js'

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
  'function wrap(bytes name, address wrappedOwner, address resolver)',
  'function setChildFuses(bytes32 parentNode, bytes32 labelhash, uint32 fuses, uint64 expiry)',
])

const ENS_REGISTRY_ABI = parseAbi([
  'function setSubnodeOwner(bytes32 node, bytes32 label, address owner) returns (bytes32)',
  'function setApprovalForAll(address operator, bool approved)',
  'function owner(bytes32 node) view returns (address)',
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
  const receipt = await localReceipt(hash)
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
  // Relative to the CHAIN's clock, never the runner's.
  //
  // The fork's timestamp only moves forward and the V1 matrix's grace/expired
  // shapes push it months ahead of real time — it sat at 2028-02-28 while the
  // runner said 2026-09-15. `Date.now() + a year` was therefore a timestamp in
  // the chain's past, so every subname was born already expired.
  //
  // That failed in the least honest way available: the NameWrapper only zeroes
  // an expired name's owner once PARENT_CANNOT_CONTROL is burnt, so emancipated
  // and locked children threw on their read-back while merely-wrapped ones were
  // created expired and reported success. A whole class of shapes was silently
  // the wrong shape, and the tests above them were asserting against it.
  const now = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp
  const expiry = config.expiry ?? now + BigInt(expiryOffset)

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
  // A child created already expired (`expiry` in the chain's past) is the
  // shape GS5/GS12 need. The NameWrapper reports an expired name's fuses as 0,
  // and its owner as 0 too once PARENT_CANNOT_CONTROL was burnt.
  if (actualExpiry <= now) {
    const wantOwner =
      (fuses & PARENT_CANNOT_CONTROL) !== 0 ? zeroAddress : ownerAddress
    if (
      actualOwner.toLowerCase() !== wantOwner.toLowerCase() ||
      actualFuses !== 0
    )
      throw new Error(
        `[makeV1Subname] ${childName} is expired but reports owner ${actualOwner}, fuses 0x${actualFuses.toString(16)}; expected ${wantOwner}, 0`,
      )
    console.log(
      `[makeV1Subname] ✅ ${childName} created expired (expiry ${actualExpiry}, owner ${actualOwner})`,
    )
    return childName
  }
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

/**
 * Wrap a subname of an **unwrapped** 2LD: the parent's controller creates the
 * child in the legacy registry, then the child's owner wraps it with
 * `NameWrapper.wrap`. A name wrapped this way has no fuses and a wrapper
 * expiry of 0 — it has no expiry of its own, which is the shape the copy
 * route's "zero expiry without PARENT_CANNOT_CONTROL is not expired" rule is
 * for.
 */
export async function wrapV1SubnameOfUnwrapped(config: {
  /** The 2LD label, without `.eth`. */
  readonly parentLabel: string
  readonly childLabel: string
  readonly parentOwnerAccount: ReturnType<typeof privateKeyToAccount>
  readonly ownerAccount: ReturnType<typeof privateKeyToAccount>
}): Promise<string> {
  const { parentLabel, childLabel, parentOwnerAccount, ownerAccount } = config
  const childName = `${childLabel}.${parentLabel}.eth`

  await waitForTx(
    await walletClient.sendTransaction({
      account: parentOwnerAccount,
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: ENS_REGISTRY_ABI,
        functionName: 'setSubnodeOwner',
        args: [
          namehash(`${parentLabel}.eth`),
          labelhash(childLabel),
          ownerAccount.address,
        ],
      }),
    }),
    `registry setSubnodeOwner(${childName})`,
  )
  await waitForTx(
    await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: ENS_REGISTRY_ABI,
        functionName: 'setApprovalForAll',
        args: [V1_NAME_WRAPPER, true],
      }),
    }),
    'registry setApprovalForAll(NameWrapper)',
  )
  const dnsName = (() => {
    const bytes: number[] = []
    for (const label of childName.split('.')) {
      const encoded = stringToBytes(label)
      bytes.push(encoded.length, ...encoded)
    }
    bytes.push(0)
    return toHex(new Uint8Array(bytes))
  })()
  await waitForTx(
    await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_NAME_WRAPPER,
      data: encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: 'wrap',
        args: [dnsName, ownerAccount.address, zeroAddress],
      }),
    }),
    `NameWrapper.wrap(${childName})`,
  )

  const [owner, fuses, expiry] = await publicClient.readContract({
    address: V1_NAME_WRAPPER,
    abi: NAME_WRAPPER_ABI,
    functionName: 'getData',
    args: [BigInt(namehash(childName))],
  })
  if (owner.toLowerCase() !== ownerAccount.address.toLowerCase())
    throw new Error(
      `[wrapV1SubnameOfUnwrapped] ${childName} reports owner ${owner}, expected ${ownerAccount.address}`,
    )
  console.log(
    `[wrapV1SubnameOfUnwrapped] ✅ ${childName} (fuses 0x${fuses.toString(16)}, expiry ${expiry})`,
  )
  return childName
}

/**
 * Turn an existing registry-only subname of a LOCKED 2LD into an emancipated
 * wrapped child — the way out for a subname that cannot follow a locked parent
 * into V2 (E2E-031). The child's owner wraps it (`NameWrapper.wrap`, keeping
 * its resolver), then the parent's owner burns PARENT_CANNOT_CONTROL on it
 * with the parent's own wrapper expiry. Burning that fuse needs the parent to
 * have CANNOT_UNWRAP, which a locked parent does.
 */
export async function wrapAndEmancipateRegistryChild(config: {
  /** The locked parent, with `.eth`. */
  readonly parentName: string
  readonly childLabel: string
  readonly parentOwnerAccount: ReturnType<typeof privateKeyToAccount>
  readonly ownerAccount: ReturnType<typeof privateKeyToAccount>
}): Promise<string> {
  const { parentName, childLabel, parentOwnerAccount, ownerAccount } = config
  const childName = `${childLabel}.${parentName}`

  await waitForTx(
    await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: ENS_REGISTRY_ABI,
        functionName: 'setApprovalForAll',
        args: [V1_NAME_WRAPPER, true],
      }),
    }),
    'registry setApprovalForAll(NameWrapper)',
  )
  const bytes: number[] = []
  for (const label of childName.split('.')) {
    const encoded = stringToBytes(label)
    bytes.push(encoded.length, ...encoded)
  }
  bytes.push(0)
  await waitForTx(
    await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_NAME_WRAPPER,
      data: encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: 'wrap',
        args: [toHex(new Uint8Array(bytes)), ownerAccount.address, zeroAddress],
      }),
    }),
    `NameWrapper.wrap(${childName})`,
  )
  await waitForTx(
    await walletClient.sendTransaction({
      account: parentOwnerAccount,
      to: V1_NAME_WRAPPER,
      data: encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: 'setChildFuses',
        args: [
          namehash(parentName),
          labelhash(childLabel),
          PARENT_CANNOT_CONTROL,
          await readWrapperExpiry(parentName),
        ],
      }),
    }),
    `NameWrapper.setChildFuses(${childName}, PARENT_CANNOT_CONTROL)`,
  )

  const [owner, fuses] = await publicClient.readContract({
    address: V1_NAME_WRAPPER,
    abi: NAME_WRAPPER_ABI,
    functionName: 'getData',
    args: [BigInt(namehash(childName))],
  })
  if (
    owner.toLowerCase() !== ownerAccount.address.toLowerCase() ||
    (fuses & PARENT_CANNOT_CONTROL) === 0
  )
    throw new Error(
      `[wrapAndEmancipateRegistryChild] ${childName}: owner ${owner}, fuses 0x${fuses.toString(16)}`,
    )
  console.log(
    `[wrapAndEmancipateRegistryChild] ✅ ${childName} (fuses 0x${fuses.toString(16)})`,
  )
  return childName
}
