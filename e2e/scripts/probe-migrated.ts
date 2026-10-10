/**
 * Probe: what does a V1 name look like in V2 *after* migration?
 *
 * Creates one migrated name per V1 token type via the `makeMigratedName`
 * fixture — the same code the portal transfer tests use, so this can't drift
 * from them — then dumps the resulting V2 state: owner, resolver, subregistry
 * and the registry roles the owner ends up holding.
 *
 * This is where the WEB-446 finding came from: only a *locked* V1 name arrives
 * with a non-zero subregistry AND without `ROLE_SET_SUBREGISTRY`, so it is the
 * one type whose owner can see a "Detach the registry" target they have no
 * authority to act on. Re-run it whenever the migration contracts change.
 *
 *   npx tsx scripts/probe-migrated.ts
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getOwner, getTokenId, hasRoles } from '@ensdomains/ensjs/public/v2'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { createMakeMigratedName } from '../fixtures/makeMigratedName.js'
import { createAccounts } from '../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../helpers/anvil-client.js'

const REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address

/** The roles the transfer flow's three steps each depend on, plus context. */
const ROLES = [
  'ROLE_CAN_TRANSFER_ADMIN',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_SUBREGISTRY',
  'ROLE_RENEW',
  'ROLE_UNREGISTER',
] as const

async function dumpV2State(name: string, account: `0x${string}`) {
  const label = name.replace(/\.eth$/, '')

  const [tokenId, owner, resolver, subregistry] = await Promise.all([
    getTokenId(publicClient as never, { label, registryAddress: REGISTRY }),
    getOwner(publicClient as never, { name }),
    publicClient.readContract({
      address: REGISTRY,
      abi: permissionedRegistryGetResolverSnippet,
      functionName: 'getResolver',
      args: [label],
    }),
    publicClient.readContract({
      address: REGISTRY,
      abi: permissionedRegistryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [label],
    }),
  ])

  console.log(`  tokenId       ${tokenId}`)
  console.log(`  owner         ${owner}  (expected ${account})`)
  console.log(`  resolver      ${resolver}`)
  console.log(`  subregistry   ${subregistry}`)

  for (const role of ROLES) {
    // Exactly the read `useCanTransferName` / `useTransferDetachTargets` make.
    const held = await hasRoles(
      publicClient as never,
      {
        registryAddress: REGISTRY,
        label,
        roles: [role],
        account,
      } as never,
    ).catch((e: Error) => `err: ${e.message.split('\n')[0]}`)
    console.log(`    ${role.padEnd(24)} ${held}`)
  }
}

async function main() {
  const accounts = createAccounts()
  const makeMigratedName = createMakeMigratedName({ accounts })
  const account = accounts.getAddress('user')

  for (const type of ['unwrapped', 'unlocked', 'locked'] as const) {
    console.log(`\n═══ ${type} ═══`)
    try {
      const name = await makeMigratedName({ label: `probe-${type}`, type })
      await dumpV2State(name, account)
    } catch (err) {
      console.log(`  ✗ FAILED: ${(err as Error).message.split('\n')[0]}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
