/**
 * Post-migration assertion helpers for V1→V2 migration tests.
 *
 * All assertions read V2 on-chain state directly via the Anvil publicClient,
 * bypassing the subgraph. This gives reliable ground-truth verification that
 * the migration transaction actually landed correctly in the V2 registry.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { expect } from '@playwright/test'
import { type Address, keccak256, parseAbi, toHex, zeroAddress } from 'viem'
import { publicClient } from './anvil-client.js'

// ---------------------------------------------------------------------------
// V2 Contract addresses
// ---------------------------------------------------------------------------
/**
 * Resolved from the ensjs Sepolia chain config — the same source
 * `makeV2Name.ts`, `playwright.portal.fixture.ts` and `transfer.spec.ts` use.
 *
 * This was previously hardcoded to `0x796fff2e…`, added with the 2026-05-14
 * single-chain deployment and since superseded. The superseded registry is
 * still deployed on the fork, which is the dangerous part: reads against it
 * succeed and return plausible answers that simply describe a different
 * contract than the one the app writes to. Measured on the fork at block
 * 0xaecd04, the two disagree — `getStatus(vitalik)` is RESERVED(1) on the
 * current registry and REGISTERED(2) on the superseded one. Nothing caught it
 * because the only specs calling these helpers are excluded by the manager
 * project's `testIgnore`.
 */
const V2_ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address

const ETH_REGISTRY_ABI = parseAbi([
  // PermissionedRegistry read functions
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
  // Roles: returns bitmap of roles held by `account` on the given label's token resource
  'function roles(uint256 labelHash, address account) view returns (uint256)',
  // ERC-1155 ownership
  'function ownerOf(uint256 tokenId) view returns (address)',
])

// V2 registry status enum
export const V2Status = {
  AVAILABLE: 0,
  RESERVED: 1,
  REGISTERED: 2,
} as const

export type V2StatusValue = (typeof V2Status)[keyof typeof V2Status]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelHashBigInt(label: string): bigint {
  return BigInt(keccak256(toHex(label)))
}

async function readStatus(label: string): Promise<number> {
  const labelHash = labelHashBigInt(label)
  return publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: ETH_REGISTRY_ABI,
    functionName: 'getStatus',
    args: [labelHash],
  })
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/**
 * Assert that the V2 ETH Registry shows the name as REGISTERED (status=2).
 * Call this as the first assertion after any migration flow.
 */
export async function assertV2Registered(label: string): Promise<void> {
  const status = await readStatus(label)
  expect(
    status,
    `Expected ${label}.eth to be REGISTERED (2) in V2, got status=${status}`,
  ).toBe(V2Status.REGISTERED)
}

/**
 * Assert that the V2 ETH Registry shows the name as RESERVED (status=1).
 * Useful for verifying the reserveInV2() step before migration.
 */
export async function assertV2Reserved(label: string): Promise<void> {
  const status = await readStatus(label)
  expect(
    status,
    `Expected ${label}.eth to be RESERVED (1) in V2, got status=${status}`,
  ).toBe(V2Status.RESERVED)
}

/**
 * Assert that a WrapperRegistry subregistry was created for a locked name.
 * The subregistry address should be non-zero after migration.
 */
export async function assertWrapperRegistryCreated(
  label: string,
): Promise<void> {
  const subregistry = await publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: ETH_REGISTRY_ABI,
    functionName: 'getSubregistry',
    args: [label],
  })
  expect(
    subregistry,
    `Expected ${label}.eth to have a WrapperRegistry subregistry after locked migration`,
  ).not.toBe(zeroAddress)
}

/**
 * Assert that no subregistry exists (expected for unlocked/unwrapped migrations).
 */
export async function assertNoSubregistry(label: string): Promise<void> {
  const subregistry = await publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: ETH_REGISTRY_ABI,
    functionName: 'getSubregistry',
    args: [label],
  })
  expect(
    subregistry,
    `Expected ${label}.eth to have no subregistry (unlocked/unwrapped migration)`,
  ).toBe(zeroAddress)
}

/**
 * Assert the V2 resolver for a label matches `expectedResolver`.
 * For names with records, this should be the V1 public resolver address
 * (records are preserved via resolver continuity, not re-written).
 */
export async function assertV2Resolver(
  label: string,
  expectedResolver: Address,
): Promise<void> {
  const resolver = await publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: ETH_REGISTRY_ABI,
    functionName: 'getResolver',
    args: [label],
  })
  expect(
    resolver.toLowerCase(),
    `Expected ${label}.eth resolver to be ${expectedResolver}`,
  ).toBe(expectedResolver.toLowerCase())
}

/**
 * Role assertions live in `role-assertions.ts` (plan item H1), which sources
 * its constants from ensjs rather than restating them. An earlier version of
 * this file exported a `REGISTRY_ROLES` map with one bit per role — but V2
 * roles are nybble-packed, four bits each, so all but `ROLE_REGISTRAR` named
 * the wrong bit. Nothing had used them yet.
 */
export {
  assertHasRoles,
  assertLacksRoles,
  assertRoleBitmap,
} from './role-assertions.js'

/**
 * Run all standard post-migration assertions for an unwrapped or unlocked name:
 * - REGISTERED in V2
 * - No WrapperRegistry subregistry
 */
export async function assertUnlockedMigration(label: string): Promise<void> {
  await assertV2Registered(label)
  await assertNoSubregistry(label)
}

/**
 * Run all standard post-migration assertions for a locked name:
 * - REGISTERED in V2
 * - WrapperRegistry created as subregistry
 */
export async function assertLockedMigration(label: string): Promise<void> {
  await assertV2Registered(label)
  await assertWrapperRegistryCreated(label)
}
