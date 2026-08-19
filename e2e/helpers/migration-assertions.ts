/**
 * Post-migration assertion helpers for V1→V2 migration tests.
 *
 * All assertions read V2 on-chain state directly via the Anvil publicClient,
 * bypassing the subgraph. This gives reliable ground-truth verification that
 * the migration transaction actually landed correctly in the V2 registry.
 */

import {
  extendChainWithEns,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import { expect } from '@playwright/test'
import { type Address, keccak256, parseAbi, toHex, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { publicClient } from './anvil-client.js'

// ---------------------------------------------------------------------------
// V2 Contract addresses
//
// Resolved from the same `@ensdomains/ensjs` chain config the manager app reads, so
// assertions can never end up inspecting a different deployment than the app wrote to.
// ---------------------------------------------------------------------------
const V2_ETH_REGISTRY = getChainContractAddress({
  chain: extendChainWithEns(sepolia),
  contract: 'ensRegistry',
})

const ETH_REGISTRY_ABI = parseAbi([
  // PermissionedRegistry read functions
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
  // Resolves a labelhash to the versioned token id, which doubles as the role resource
  'function getTokenId(uint256 labelId) view returns (uint256)',
  // Roles: returns bitmap of roles held by `account` on the given resource
  'function roles(uint256 resource, address account) view returns (uint256)',
  // ERC-1155 ownership
  'function ownerOf(uint256 tokenId) view returns (address)',
])

/** `WrapperRegistry` (the subregistry created for locked names). */
const WRAPPER_REGISTRY_ABI = parseAbi([
  'function ROOT_RESOURCE() view returns (uint256)',
  'function roles(uint256 resource, address account) view returns (uint256)',
  'function getWrappedNode() view returns (bytes32)',
])

// V2 registry status enum
export const V2Status = {
  AVAILABLE: 0,
  RESERVED: 1,
  REGISTERED: 2,
} as const

export type V2StatusValue = (typeof V2Status)[keyof typeof V2Status]

// ---------------------------------------------------------------------------
// Role bitmap constants (RegistryRolesLib)
//
// EnhancedAccessControl packs roles into NYBBLES: each role occupies 4 bits, so
// consecutive roles are 4 bits apart — not 1. The admin counterpart of a role sits
// exactly 128 bits higher.
// ---------------------------------------------------------------------------
export const REGISTRY_ROLES = {
  ROLE_REGISTRAR: 1n << 0n,
  ROLE_REGISTER_RESERVED: 1n << 4n,
  ROLE_SET_PARENT: 1n << 8n,
  ROLE_UNREGISTER: 1n << 12n,
  ROLE_RENEW: 1n << 16n,
  ROLE_SET_SUBREGISTRY: 1n << 20n,
  ROLE_SET_RESOLVER: 1n << 24n,
  ROLE_WAS_RESERVED: 1n << 32n,
  ROLE_SET_URI: 1n << 36n,
  ROLE_CAN_NAME: 1n << 120n,
  ROLE_UPGRADE: 1n << 124n,
  // Admin variants live 128 bits higher. `ROLE_CAN_TRANSFER_ADMIN` is admin-only —
  // there is no non-admin counterpart.
  ROLE_REGISTRAR_ADMIN: 1n << 128n,
  ROLE_REGISTER_RESERVED_ADMIN: 1n << 132n,
  ROLE_SET_PARENT_ADMIN: 1n << 136n,
  ROLE_UNREGISTER_ADMIN: 1n << 140n,
  ROLE_RENEW_ADMIN: 1n << 144n,
  ROLE_SET_SUBREGISTRY_ADMIN: 1n << 148n,
  ROLE_SET_RESOLVER_ADMIN: 1n << 152n,
  ROLE_CAN_TRANSFER_ADMIN: 1n << 156n,
  ROLE_CAN_NAME_ADMIN: 1n << 248n,
  ROLE_UPGRADE_ADMIN: 1n << 252n,
} as const

/** Roles granted by `ETHRegistrar.REGISTRATION_ROLE_BITMAP` (unlocked/unwrapped path). */
export const REGISTRATION_ROLE_BITMAP =
  REGISTRY_ROLES.ROLE_SET_SUBREGISTRY |
  REGISTRY_ROLES.ROLE_SET_SUBREGISTRY_ADMIN |
  REGISTRY_ROLES.ROLE_SET_RESOLVER |
  REGISTRY_ROLES.ROLE_SET_RESOLVER_ADMIN |
  REGISTRY_ROLES.ROLE_CAN_TRANSFER_ADMIN

// ---------------------------------------------------------------------------
// NameWrapper fuses and the V1 → V2 role mapping
// ---------------------------------------------------------------------------

export const NAME_WRAPPER_FUSES = {
  CANNOT_UNWRAP: 1n,
  CANNOT_BURN_FUSES: 2n,
  CANNOT_TRANSFER: 4n,
  CANNOT_SET_RESOLVER: 8n,
  CANNOT_SET_TTL: 16n,
  CANNOT_CREATE_SUBDOMAIN: 32n,
  CANNOT_APPROVE: 64n,
  PARENT_CANNOT_CONTROL: 1n << 16n,
  IS_DOT_ETH: 1n << 17n,
  CAN_EXTEND_EXPIRY: 1n << 18n,
} as const

const hasFuse = (fuses: bigint, fuse: bigint): boolean => (fuses & fuse) !== 0n

/**
 * Expected token-resource roles for a migrated locked name.
 *
 * Independent re-derivation of `LockedWrapperReceiver._tokenRoleBitmapFromFuses` — the E2E
 * layer deliberately keeps its own oracle rather than importing the app's copy, so a bug
 * in the app's mirror cannot make the E2E assertion agree with it.
 *
 * Does NOT include `ROLE_WAS_RESERVED`, which the registry stamps independently of fuses.
 */
export function expectedLockedTokenRoles(fuses: bigint): bigint {
  let roleBitmap = 0n
  if (hasFuse(fuses, NAME_WRAPPER_FUSES.CAN_EXTEND_EXPIRY)) {
    roleBitmap |= REGISTRY_ROLES.ROLE_RENEW
  }
  if (!hasFuse(fuses, NAME_WRAPPER_FUSES.CANNOT_SET_RESOLVER)) {
    roleBitmap |= REGISTRY_ROLES.ROLE_SET_RESOLVER
  }
  // A frozen V1 fuse set becomes a frozen V2 role set: no admin of the above.
  if (!hasFuse(fuses, NAME_WRAPPER_FUSES.CANNOT_BURN_FUSES)) {
    roleBitmap |= roleBitmap << 128n
  }
  // Applied after the shift, so transferability is never "admin of admin" and is
  // granted regardless of the freeze.
  if (!hasFuse(fuses, NAME_WRAPPER_FUSES.CANNOT_TRANSFER)) {
    roleBitmap |= REGISTRY_ROLES.ROLE_CAN_TRANSFER_ADMIN
  }
  return roleBitmap
}

/**
 * Expected `WrapperRegistry` root-resource roles for a migrated locked name.
 * Mirrors `LockedWrapperReceiver._subregistryRoleBitmapFromFuses`.
 */
export function expectedWrapperRootRoles(fuses: bigint): bigint {
  let roleBitmap =
    REGISTRY_ROLES.ROLE_RENEW |
    REGISTRY_ROLES.ROLE_UPGRADE |
    REGISTRY_ROLES.ROLE_CAN_NAME
  if (!hasFuse(fuses, NAME_WRAPPER_FUSES.CANNOT_CREATE_SUBDOMAIN)) {
    roleBitmap |= REGISTRY_ROLES.ROLE_REGISTRAR
  }
  if (!hasFuse(fuses, NAME_WRAPPER_FUSES.CANNOT_BURN_FUSES)) {
    roleBitmap |= roleBitmap << 128n
  }
  return roleBitmap
}

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

/**
 * Resolve a label to its versioned V2 token id, which is also the role resource.
 * Roles must be read against this, not the bare labelhash — they diverge once a
 * label has been re-registered and its version counter has advanced.
 */
async function readTokenId(label: string): Promise<bigint> {
  return publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: ETH_REGISTRY_ABI,
    functionName: 'getTokenId',
    args: [labelHashBigInt(label)],
  })
}

async function readTokenRoles(
  label: string,
  account: Address,
): Promise<bigint> {
  const tokenId = await readTokenId(label)
  return publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: ETH_REGISTRY_ABI,
    functionName: 'roles',
    args: [tokenId, account],
  })
}

async function readWrapperRegistry(label: string): Promise<Address> {
  return publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: ETH_REGISTRY_ABI,
    functionName: 'getSubregistry',
    args: [label],
  })
}

const formatRoles = (bitmap: bigint): string => `0x${bitmap.toString(16)}`

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
 * Assert that `account` has the given role bits set on `label`'s V2 token resource.
 * `expectedRoles` is a bigint bitmap (use REGISTRY_ROLES constants).
 *
 * Checks that every bit in `expectedRoles` is present in the actual bitmap;
 * does NOT require an exact match (other roles may also be set).
 */
export async function assertHasRoles(
  label: string,
  account: Address,
  expectedRoles: bigint,
): Promise<void> {
  const actualBitmap = await readTokenRoles(label, account)
  const missing = expectedRoles & ~actualBitmap
  expect(
    missing,
    `Account ${account} is missing roles ${formatRoles(missing)} on ${label}.eth ` +
      `(actual=${formatRoles(actualBitmap)}, expected=${formatRoles(expectedRoles)})`,
  ).toBe(0n)
}

/**
 * Assert that `account` does NOT have specific role bits on `label`'s V2 token resource.
 */
export async function assertLacksRoles(
  label: string,
  account: Address,
  forbiddenRoles: bigint,
): Promise<void> {
  const actualBitmap = await readTokenRoles(label, account)
  const present = forbiddenRoles & actualBitmap
  expect(
    present,
    `Account ${account} unexpectedly has roles ${formatRoles(present)} on ${label}.eth ` +
      `(actual=${formatRoles(actualBitmap)})`,
  ).toBe(0n)
}

/**
 * Assert the token-resource role bitmap for `account` is EXACTLY `expectedRoles`.
 *
 * Exactness is the point for fuse migration: an over-grant (a permission the V1 fuses
 * revoked) is as much a bug as an under-grant, and a subset check cannot see it.
 */
export async function assertExactTokenRoles(
  label: string,
  account: Address,
  expectedRoles: bigint,
): Promise<void> {
  const actualBitmap = await readTokenRoles(label, account)
  expect(
    formatRoles(actualBitmap),
    `Token roles for ${label}.eth / ${account}: ` +
      `unexpected=${formatRoles(actualBitmap & ~expectedRoles)}, ` +
      `missing=${formatRoles(expectedRoles & ~actualBitmap)}`,
  ).toBe(formatRoles(expectedRoles))
}

/**
 * Assert the `WrapperRegistry` ROOT_RESOURCE role bitmap for `account` is EXACTLY
 * `expectedRoles`.
 *
 * `WrapperRegistry` stores root roles against a *virtual owner* (the parent registry) and
 * remaps the current token owner onto it, so querying with the owner address is correct
 * and also proves the remapping works.
 */
export async function assertExactWrapperRootRoles(
  label: string,
  account: Address,
  expectedRoles: bigint,
): Promise<void> {
  const registry = await readWrapperRegistry(label)
  expect(
    registry,
    `Expected ${label}.eth to have a WrapperRegistry before checking root roles`,
  ).not.toBe(zeroAddress)

  const rootResource = await publicClient.readContract({
    address: registry,
    abi: WRAPPER_REGISTRY_ABI,
    functionName: 'ROOT_RESOURCE',
  })
  const actualBitmap = await publicClient.readContract({
    address: registry,
    abi: WRAPPER_REGISTRY_ABI,
    functionName: 'roles',
    args: [rootResource, account],
  })
  expect(
    formatRoles(actualBitmap),
    `WrapperRegistry root roles for ${label}.eth / ${account}: ` +
      `unexpected=${formatRoles(actualBitmap & ~expectedRoles)}, ` +
      `missing=${formatRoles(expectedRoles & ~actualBitmap)}`,
  ).toBe(formatRoles(expectedRoles))
}

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

/**
 * Full post-migration verification for a locked name with a known V1 fuse bitmap:
 * REGISTERED, WrapperRegistry created, and BOTH role bitmaps exactly as the
 * fuse mapping dictates.
 *
 * `fuses` must be the complete NameWrapper fuse word as stored on-chain — for a wrapped
 * `.eth` 2LD that includes `PARENT_CANNOT_CONTROL | IS_DOT_ETH`.
 */
export async function assertLockedFuseMigration(
  label: string,
  account: Address,
  fuses: bigint,
): Promise<void> {
  await assertLockedMigration(label)
  await assertExactTokenRoles(
    label,
    account,
    // The registry stamps ROLE_WAS_RESERVED on premigrated names, independent of fuses.
    expectedLockedTokenRoles(fuses) | REGISTRY_ROLES.ROLE_WAS_RESERVED,
  )
  await assertExactWrapperRootRoles(
    label,
    account,
    expectedWrapperRootRoles(fuses),
  )
}

/**
 * Assert a name was NOT migrated — it must still sit in its premigrated RESERVED slot.
 * Used for fuse states that make a name ineligible (e.g. `CANNOT_TRANSFER`), where the
 * correct app behaviour is to skip the name rather than attempt and fail.
 */
export async function assertNotMigrated(label: string): Promise<void> {
  const status = await readStatus(label)
  expect(
    status,
    `Expected ${label}.eth to remain unmigrated (RESERVED=1), got status=${status}`,
  ).toBe(V2Status.RESERVED)
}
