/**
 * Read an account's resolver role bitmap per name resource.
 *
 * The Resolver Roles UI groups every assignment for an account into one row and keeps
 * only the names as display strings, so the table cannot show you which role sits on
 * which resource. This reads the contract directly, one resource at a time — the view
 * the UI collapses.
 *
 * Usage:
 *   pnpm --filter @ens-apps/e2e resolver:roles <resolver> <account> <name> [name...]
 */
import {
  type Address,
  createPublicClient,
  encodePacked,
  http,
  keccak256,
  namehash,
  parseAbi,
} from 'viem'

const ZERO32 = `0x${'0'.repeat(64)}` as const

/** Mirrors PermissionedResolverLib.resource(node, 0). */
const nameResource = (name: string): bigint =>
  BigInt(
    keccak256(encodePacked(['bytes32', 'bytes32'], [namehash(name), ZERO32])),
  )

/**
 * Resolver role bits — mirrors `resolverRoles` in
 * apps/portal/src/lib/roles/resolverRoles.ts. These are RESOLVER roles
 * (record writes). Registry roles — Set Resolver, Set Subregistry, Can
 * Transfer — are a different contract and a disjoint bitmap; this script
 * will correctly report "none" if you point it at those.
 */
const ROLES: Record<string, bigint> = {
  ROLE_SET_ADDR: 1n << 0n,
  ROLE_SET_TEXT: 1n << 4n,
  ROLE_SET_CONTENTHASH: 1n << 8n,
  ROLE_SET_PUBKEY: 1n << 12n,
  ROLE_SET_ABI: 1n << 16n,
  ROLE_SET_INTERFACE: 1n << 20n,
  ROLE_SET_NAME: 1n << 24n,
  ROLE_SET_ALIAS: 1n << 28n,
  ROLE_CLEAR: 1n << 32n,
  ROLE_UPGRADE: 1n << 124n,
}

const [resolver, account, ...names] = process.argv.slice(2)
if (!resolver || !account || names.length === 0) {
  console.error(
    'usage: resolver:roles <resolverAddress> <account> <name.eth> [name.eth...]',
  )
  process.exit(1)
}

const client = createPublicClient({ transport: http('http://127.0.0.1:8545') })
const abi = parseAbi([
  'function roles(uint256 resource, address account) view returns (uint256)',
])

console.log(`resolver ${resolver}\naccount  ${account}\n`)
for (const name of names) {
  const bitmap = await client.readContract({
    address: resolver as Address,
    abi,
    functionName: 'roles',
    args: [nameResource(name), account as Address],
  })
  const held = Object.entries(ROLES)
    .filter(([, bit]) => (bitmap & bit) !== 0n)
    .map(([label]) => label)
  console.log(
    `  ${name.padEnd(28)} 0x${bitmap.toString(16).padStart(8, '0')}  ${
      held.length ? held.join(', ') : '— none —'
    }`,
  )
}
