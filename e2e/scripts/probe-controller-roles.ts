/**
 * Probe: why does `MigrationHelper.migrate` revert with
 * `EACUnauthorizedAccountRoles(0, 1, <controller>)`?
 *
 * Prints the ROOT-level roles each migration controller holds on the v2 `.eth`
 * registry, and optionally whether a given label has a live v2 slot.
 *
 * The controllers are granted `ROLE_REGISTER_RESERVED` only — never
 * `ROLE_REGISTRAR` — so they can claim a label that is already RESERVED but not
 * one that is AVAILABLE. A revert naming `ROLE_REGISTRAR` (`0x1`) therefore
 * means "this name was never reserved in the registry the app is using",
 * usually because a hardcoded address drifted from the ensjs chain config.
 *
 *   npx tsx scripts/probe-controller-roles.ts [label ...]
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getOwner, getTokenId } from '@ensdomains/ensjs/public/v2'
import { eacHasRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryGetExpirySnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { publicClient } from '../helpers/anvil-client.js'

const c = ensL1Contracts[supportedL1Chains.sepolia]
const REGISTRY = c.ensRegistry.address

/** Root-only roles, per ensjs `utils/v2/roles/registryRoles.ts`. */
const ROLES = {
  ROLE_REGISTRAR: 1n << 0n,
  ROLE_REGISTER_RESERVED: 1n << 4n,
} as const

/** `getResource` canonicalises the registry root to resource 0. */
const ROOT_RESOURCE = 0n

const contracts = {
  UnlockedMigrationController: c.ensUnlockedMigrationController.address,
  LockedMigrationController: c.ensLockedMigrationController.address,
  MigrationHelper: c.ensMigrationHelper.address,
  EthRegistrar: c.ensEthRegistrar.address,
}

/** How the v2 slot's expiry reads against the current block. */
function describeSlot(expiry: bigint | null, now: number): string {
  if (expiry === null) return 'unknown'
  if (expiry === 0n) return 'NOT RESERVED / AVAILABLE'
  return Number(expiry) > now
    ? 'slot live (RESERVED or REGISTERED)'
    : 'EXPIRED → AVAILABLE'
}

/** Root roles held by each contract that participates in migration. */
async function reportRootRoles() {
  for (const [name, address] of Object.entries(contracts)) {
    const held: string[] = []
    for (const [role, bitmap] of Object.entries(ROLES)) {
      const ok = await publicClient
        .readContract({
          address: REGISTRY,
          abi: eacHasRolesSnippet,
          functionName: 'hasRoles',
          args: [ROOT_RESOURCE, bitmap, address],
        })
        .catch(() => false)
      if (ok) held.push(role)
    }
    console.log(`${name.padEnd(30)} ${address}`)
    console.log(`  root roles: ${held.length ? held.join(', ') : '(none)'}`)
  }
}

/** Whether a label has a live v2 slot, and who owns it. */
async function reportSlot(label: string) {
  console.log(`\n${label}.eth`)
  try {
    const tokenId = await getTokenId(publicClient as never, {
      label,
      registryAddress: REGISTRY,
    })
    const [owner, expiry] = await Promise.all([
      getOwner(publicClient as never, { name: `${label}.eth` }).catch(
        () => null,
      ),
      publicClient
        .readContract({
          address: REGISTRY,
          abi: permissionedRegistryGetExpirySnippet,
          functionName: 'getExpiry',
          args: [tokenId],
        })
        .catch(() => null),
    ])
    const now = Number((await publicClient.getBlock()).timestamp)
    console.log(`  owner  ${owner}`)
    console.log(
      `  expiry ${expiry} (now ${now}) → ${describeSlot(expiry, now)}`,
    )
  } catch (e) {
    console.log(`  no v2 slot: ${(e as Error).message.split('\n')[0]}`)
  }
}

async function main() {
  console.log(`registry: ${REGISTRY}\n`)
  await reportRootRoles()
  for (const label of process.argv.slice(2)) {
    await reportSlot(label)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
