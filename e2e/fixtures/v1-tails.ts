/**
 * The writes that happen *after* a V1 name tree exists, because no declarative
 * shape can express them.
 *
 * Each one is a state the protocol only reaches imperatively: the
 * registrant/controller split is two contracts disagreeing on purpose, and the
 * wrapper mismatches are a name being wrapped or unwrapped after its parent
 * was already decided. The dev-tools drawer has three of these open-coded in
 * `finishReassignPreset`; naming them here is what lets the drawer and the e2e
 * fixtures mean the same thing by "shape".
 *
 * Every tail reads its own postcondition back and throws (ground rule 5). A
 * tail that silently no-ops is the worst failure mode available here: the shape
 * degrades into a *different, valid* shape, so the seeding succeeds, the tests
 * run, and they assert the wrong cell's expectations.
 */

import {
  type Address,
  encodeFunctionData,
  type Hash,
  labelhash,
  namehash,
  parseAbi,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'
import { publicClient, walletClient } from '../helpers/anvil-client.js'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from './makeV1Name.js'

type Signer = ReturnType<typeof privateKeyToAccount>

const REGISTRAR_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
])
const REGISTRY_ABI = parseAbi([
  'function setOwner(bytes32 node, address owner)',
  'function owner(bytes32 node) view returns (address)',
])
const WRAPPER_ABI = parseAbi([
  'function unwrap(bytes32 parentNode, bytes32 labelhash, address controller)',
  'function unwrapETH2LD(bytes32 labelhash, address registrant, address controller)',
  'function ownerOf(uint256 id) view returns (address)',
])

const send = async (account: Signer, to: Address, data: Hash, what: string) => {
  const hash = await walletClient.sendTransaction({ account, to, data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`[v1-tails] ${what} reverted (tx ${hash})`)
  }
}

const registryOwner = (name: string) =>
  publicClient.readContract({
    address: V1_ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [namehash(name)],
  })

const registrantOf = (label: string) =>
  publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: REGISTRAR_ABI,
    functionName: 'ownerOf',
    args: [BigInt(labelhash(label))],
  })

const expectAddress = (
  actual: Address,
  expected: Address,
  what: string,
): void => {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`[v1-tails] ${what}: expected ${expected}, got ${actual}`)
  }
}

/**
 * Hand the ERC-721 away and keep the registry controller — the wallet ends up
 * managing a name it does not own. `safeTransferFrom` pointedly does not touch
 * the registry, which is exactly why `reclaim` exists as a separate call.
 */
export const splitRegistrant = async (
  name: string,
  from: Signer,
  to: Address,
): Promise<void> => {
  const label = name.replace(/\.eth$/, '')
  await send(
    from,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: 'safeTransferFrom',
      args: [from.address, to, BigInt(labelhash(label))],
    }),
    `splitRegistrant(${name})`,
  )
  expectAddress(await registrantOf(label), to, `${name} registrant`)
  expectAddress(await registryOwner(name), from.address, `${name} controller`)
}

/**
 * The mirror: keep the ERC-721 and hand the controller away, so the wallet
 * owns a name whose records it cannot write.
 */
export const splitController = async (
  name: string,
  from: Signer,
  to: Address,
): Promise<void> => {
  await send(
    from,
    V1_ENS_REGISTRY,
    encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: 'setOwner',
      args: [namehash(name), to],
    }),
    `splitController(${name})`,
  )
  expectAddress(await registryOwner(name), to, `${name} controller`)
}

/**
 * Unwrap a subname onto `to`: its parent stays wrapped while the child becomes
 * a plain registry node. Requires the child's PCC to be unburned — an
 * emancipated child cannot be unwrapped by anyone.
 */
export const unwrapChild = async (
  childName: string,
  holder: Signer,
  to: Address,
): Promise<void> => {
  const [label, ...rest] = childName.split('.')
  const parentName = rest.join('.')
  await send(
    holder,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: WRAPPER_ABI,
      functionName: 'unwrap',
      args: [namehash(parentName), labelhash(label as string), to],
    }),
    `unwrapChild(${childName})`,
  )
  expectAddress(await registryOwner(childName), to, `${childName} controller`)
}

/**
 * Unwrap a `.eth` 2LD, leaving a wrapped child under an unwrapped parent —
 * the mismatch in the other direction, which nothing in the suite builds today.
 */
export const unwrapParent2LD = async (
  name: string,
  holder: Signer,
  to: Address,
): Promise<void> => {
  const label = name.replace(/\.eth$/, '')
  await send(
    holder,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: WRAPPER_ABI,
      functionName: 'unwrapETH2LD',
      args: [labelhash(label), to, to],
    }),
    `unwrapParent2LD(${name})`,
  )
  expectAddress(await registrantOf(label), to, `${name} registrant`)
  expectAddress(await registryOwner(name), to, `${name} controller`)
}
