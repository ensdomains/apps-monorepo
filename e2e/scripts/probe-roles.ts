/**
 * Print the v2 registry roles an account holds on a label.
 *
 *   npx tsx scripts/probe-roles.ts <label> [account]
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { hasRoles } from '@ensdomains/ensjs/public/v2'
import { publicClient } from '../helpers/anvil-client.js'

const REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address

const label = process.argv[2]
const account = process.argv[3] ?? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const ROLES = [
  'ROLE_CAN_TRANSFER_ADMIN',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_SUBREGISTRY',
  'ROLE_RENEW',
  'ROLE_UNREGISTER',
] as const

async function main() {
  console.log(`registry ${REGISTRY}`)
  console.log(`${label}.eth — roles held by ${account}\n`)
  for (const role of ROLES) {
    const held = await hasRoles(
      publicClient as never,
      {
        registryAddress: REGISTRY,
        label,
        roles: [role],
        account,
      } as never,
    ).catch((e: Error) => `err: ${e.message.split('\n')[0]}`)
    console.log(`  ${role.padEnd(26)} ${held}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
