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

/**
 * The two contracts the copy route certifies a `UserRegistry` against. Both are
 * in the ensjs Sepolia config, so the copy oracles need no address literals of
 * their own (rule 7).
 */
const V2_VERIFIABLE_FACTORY = ensL1Contracts[supportedL1Chains.sepolia]
  .ensVerifiableFactory.address as Address
const V2_USER_REGISTRY_IMPL = ensL1Contracts[supportedL1Chains.sepolia]
  .ensUserRegistryImpl.address as Address

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

/**
 * Reads a `UserRegistry` — the deterministic per-parent registry a copied
 * subname is re-created inside. Mirrors `registryReadAbi` in the app's
 * `copyMigrationReadiness.ts`, so these assertions check the same state the
 * app's own readiness gate does.
 */
const USER_REGISTRY_ABI = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
  'function getParent() view returns (address parent, string label)',
  'function getState(uint256 anyId) view returns (State state)',
  'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
])

const FACTORY_ABI = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
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

// ---------------------------------------------------------------------------
// Copied subnames (`action: 'copy'`)
// ---------------------------------------------------------------------------
//
// A copied subname is not migrated — it is RE-CREATED inside a deterministic
// `UserRegistry` deployed for its parent. So none of the assertions above
// apply to it: there is no token to own and no entry in the .eth registry.
//
// These oracles deliberately read FORWARD from the .eth registry rather than
// recomputing the deterministic address from the salt. Reading forward proves
// three things at once — the registry is attached where resolution will
// actually look for it, it was deployed by the canonical VerifiableFactory
// against the canonical implementation, and it knows its own parent — whereas
// recomputing the address only proves it equals a number we also computed.
// It also keeps the salt derivation out of the test suite entirely.

/** `alice.eth` → `['alice']`; `x.sub.alice.eth` → `['alice', 'sub', 'x']`. */
function labelPath(fullName: string): string[] {
  const withoutTld = fullName.replace(/\.eth$/i, '')
  return withoutTld.split('.').reverse()
}

/** Read a label's subregistry from any registry. */
async function readSubregistry(
  registry: Address,
  label: string,
): Promise<Address> {
  return publicClient.readContract({
    address: registry,
    abi: USER_REGISTRY_ABI,
    functionName: 'getSubregistry',
    args: [label],
  })
}

/**
 * Walk from the .eth registry down to the registry that directly holds
 * `fullName`'s own label, returning that registry and the label.
 *
 * For `sub.alice.eth` this is `(UserRegistry(alice.eth), 'sub')`; for
 * `x.sub.alice.eth` it walks one level further. This is the same traversal
 * resolution performs, so a name that fails here is genuinely unresolvable.
 */
export async function resolveRegistryPath(
  fullName: string,
): Promise<{ registry: Address; label: string }> {
  const labels = labelPath(fullName)
  let registry: Address = V2_ETH_REGISTRY
  for (const label of labels.slice(0, -1)) {
    const next = await readSubregistry(registry, label)
    expect(
      next,
      `Resolving ${fullName}: "${label}" has no subregistry under ${registry}, ` +
        `so nothing below it can resolve`,
    ).not.toBe(zeroAddress)
    registry = next
  }
  return { registry, label: labels[labels.length - 1] }
}

/**
 * Assert that `parentFullName` has a `UserRegistry` attached, that it is
 * factory-certified against the canonical implementation, and that it knows
 * the parent it hangs off. Returns the registry address.
 */
export async function assertUserRegistryAttached(
  parentFullName: string,
): Promise<Address> {
  const { registry: parentRegistry, label } =
    await resolveRegistryPath(parentFullName)
  const registry = await readSubregistry(parentRegistry, label)
  expect(
    registry,
    `Expected ${parentFullName} to have a UserRegistry subregistry after copying a subname into it`,
  ).not.toBe(zeroAddress)

  const implementation = await publicClient.readContract({
    address: V2_VERIFIABLE_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'verifyContract',
    args: [registry],
  })
  expect(
    implementation.toLowerCase(),
    `${parentFullName}'s subregistry ${registry} is not a VerifiableFactory proxy of the canonical UserRegistry implementation`,
  ).toBe(V2_USER_REGISTRY_IMPL.toLowerCase())

  const [parent, parentLabel] = await publicClient.readContract({
    address: registry,
    abi: USER_REGISTRY_ABI,
    functionName: 'getParent',
  })
  expect(
    [parent.toLowerCase(), parentLabel],
    `${parentFullName}'s UserRegistry reports the wrong canonical parent`,
  ).toEqual([parentRegistry.toLowerCase(), label])

  return registry
}

/**
 * Negative control: the parent has no UserRegistry at all. Use this to prove a
 * copy did NOT happen — e.g. that a child under a locked 2LD stayed on the
 * WrapperRegistry token route.
 */
export async function assertNoUserRegistry(
  parentFullName: string,
): Promise<void> {
  const { registry: parentRegistry, label } =
    await resolveRegistryPath(parentFullName)
  const registry = await readSubregistry(parentRegistry, label)
  expect(
    registry,
    `Expected ${parentFullName} to have NO subregistry, but found ${registry}`,
  ).toBe(zeroAddress)
}

/**
 * Assert a parent DOES have a subregistry, but that it is not a `UserRegistry`.
 *
 * This is the discriminating oracle for "the copy path did not swallow the
 * token path". A child of a LOCKED 2LD is a `locked-child` / `detached-child`
 * token migration and must land in a WrapperRegistry; both routes leave a
 * non-zero subregistry, so merely asserting non-zero cannot tell them apart.
 * The factory's implementation pointer can.
 */
export async function assertNotUserRegistry(
  parentFullName: string,
): Promise<void> {
  const { registry: parentRegistry, label } =
    await resolveRegistryPath(parentFullName)
  const registry = await readSubregistry(parentRegistry, label)
  expect(
    registry,
    `Expected ${parentFullName} to have a subregistry after a locked migration`,
  ).not.toBe(zeroAddress)

  const implementation = await publicClient.readContract({
    address: V2_VERIFIABLE_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'verifyContract',
    args: [registry],
  })
  expect(
    implementation.toLowerCase(),
    `${parentFullName}'s subregistry is a UserRegistry — the copy route claimed a name ` +
      `that should have taken the WrapperRegistry token route`,
  ).not.toBe(V2_USER_REGISTRY_IMPL.toLowerCase())
}

/** Assert the wallet holds root roles on a UserRegistry. */
export async function assertUserRegistryRootRoles(
  registry: Address,
  account: Address,
  roleBitmap: bigint,
): Promise<void> {
  const hasRoles = await publicClient.readContract({
    address: registry,
    abi: USER_REGISTRY_ABI,
    functionName: 'hasRootRoles',
    args: [roleBitmap, account],
  })
  expect(
    hasRoles,
    `Expected ${account} to hold root roles 0x${roleBitmap.toString(16)} on UserRegistry ${registry}`,
  ).toBe(true)
}

/**
 * Assert a copied subname is REGISTERED in its parent's registry and owned by
 * `expectedOwner`. This is the core "the copy landed" oracle.
 */
export async function assertCopyRegistered(
  fullName: string,
  expectedOwner: Address,
): Promise<void> {
  const { registry, label } = await resolveRegistryPath(fullName)
  const state = await publicClient.readContract({
    address: registry,
    abi: USER_REGISTRY_ABI,
    functionName: 'getState',
    args: [BigInt(keccak256(toHex(label)))],
  })
  expect(
    state.status,
    `Expected copied name ${fullName} to be REGISTERED (2) in ${registry}, got status=${state.status}`,
  ).toBe(V2Status.REGISTERED)
  expect(
    state.latestOwner.toLowerCase(),
    `Expected copied name ${fullName} to be owned by ${expectedOwner}`,
  ).toBe(expectedOwner.toLowerCase())
}

/**
 * Assert a copied subname's expiry. This is the single check that tells the two
 * copy sources apart: a `registry-child` has no expiry of its own in V1, so it
 * is copied with `MAX_UINT64`, while an `unlocked-child` carries its
 * NameWrapper `wrappedDomain.expiryDate` across.
 */
export async function assertCopyExpiry(
  fullName: string,
  expectedExpiry: bigint,
): Promise<void> {
  const { registry, label } = await resolveRegistryPath(fullName)
  const state = await publicClient.readContract({
    address: registry,
    abi: USER_REGISTRY_ABI,
    functionName: 'getState',
    args: [BigInt(keccak256(toHex(label)))],
  })
  expect(
    state.expiry,
    `Expected copied name ${fullName} to expire at ${expectedExpiry}`,
  ).toBe(expectedExpiry)
}

/** Assert a copied subname's resolver in its parent's registry. */
export async function assertCopyResolver(
  fullName: string,
  expectedResolver: Address,
): Promise<void> {
  const { registry, label } = await resolveRegistryPath(fullName)
  const resolver = await publicClient.readContract({
    address: registry,
    abi: USER_REGISTRY_ABI,
    functionName: 'getResolver',
    args: [label],
  })
  expect(
    resolver.toLowerCase(),
    `Expected copied name ${fullName} to resolve via ${expectedResolver}`,
  ).toBe(expectedResolver.toLowerCase())
}

/** `2^64 - 1` — the expiry a `registry-child` copy is created with. */
export const MAX_UINT64 = (1n << 64n) - 1n
