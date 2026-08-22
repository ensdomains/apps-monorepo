/**
 * Show BOTH authority stores for a name, side by side — the view no screen gives you.
 *
 * A V2 name is governed by two independent role stores:
 *
 *   registry roles  — move with the token. `PermissionedRegistry._update` calls
 *                     `_transferRoles` on every ERC-1155 transfer.
 *   resolver roles  — who may write the records. Nothing in the transfer flow
 *                     touches them (`buildTransferPlan` emits four steps, none of
 *                     which is a grant or a revoke).
 *
 * Run it before and after a transfer. The registry block changes hands; the
 * resolver block does not.
 *
 * The `via` column is the point: `hasRoles(nameResource, ...)` is what the portal
 * asks before it shows the record editor, and `_effectiveRoles` ORs in the ROOT
 * resource — so a root grant answers TRUE for a name it was never scoped to.
 *
 * Read-only. Sends no transactions.
 *
 * Usage:
 *   pnpm --filter @ens-apps/e2e authority <label> <seller> <buyer>
 *   pnpm --filter @ens-apps/e2e authority dup1 0xf39F...2266 0x7099...79C8
 */
import {
  extendChainWithEns,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import {
  type Address,
  createPublicClient,
  encodePacked,
  http,
  keccak256,
  namehash,
  parseAbi,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'

const ZERO32 = `0x${'0'.repeat(64)}` as const

/** Mirrors PermissionedResolverLib.resource(node, 0). */
const nameResource = (name: string): bigint =>
  BigInt(
    keccak256(encodePacked(['bytes32', 'bytes32'], [namehash(name), ZERO32])),
  )

/** Resolver roles — record writes. Mirrors apps/portal/src/lib/roles/resolverRoles.ts. */
const RESOLVER_ROLES: Record<string, bigint> = {
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

/** Registry roles — the subset worth showing. Mirrors RegistryRolesLib. */
const REGISTRY_ROLES: Record<string, bigint> = {
  ROLE_RENEW: 1n << 16n,
  ROLE_SET_SUBREGISTRY: 1n << 20n,
  ROLE_SET_RESOLVER: 1n << 24n,
  ROLE_SET_SUBREGISTRY_ADMIN: 1n << 148n,
  ROLE_SET_RESOLVER_ADMIN: 1n << 152n,
  ROLE_CAN_TRANSFER_ADMIN: 1n << 156n,
}

const [label, seller, buyer] = process.argv.slice(2)
if (!label || !seller || !buyer) {
  console.error('usage: authority <label> <sellerAddress> <buyerAddress>')
  process.exit(1)
}

const name = label.endsWith('.eth') ? label : `${label}.eth`
const bareLabel = name.replace(/\.eth$/, '')

const client = createPublicClient({ transport: http('http://127.0.0.1:8545') })

const REGISTRY = getChainContractAddress({
  chain: extendChainWithEns(sepolia),
  contract: 'ensRegistry',
})

const registryAbi = parseAbi([
  'function getResolver(string label) view returns (address)',
  'function getTokenId(uint256 labelId) view returns (uint256)',
  'function roles(uint256 resource, address account) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
])

const resolverAbi = parseAbi([
  'function roles(uint256 resource, address account) view returns (uint256)',
  'function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)',
])

const decode = (bitmap: bigint, table: Record<string, bigint>): string => {
  const held = Object.entries(table)
    .filter(([, bit]) => (bitmap & bit) !== 0n)
    .map(([key]) => key.replace('ROLE_', ''))
  return held.length ? held.join(', ') : '— none —'
}

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

const resolver = await client.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: 'getResolver',
  args: [bareLabel],
})

const tokenId = await client.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: 'getTokenId',
  args: [BigInt(keccak256(toHex(bareLabel)))],
})

const owner = await client.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: 'ownerOf',
  args: [tokenId],
})

const who = (addr: string) =>
  addr.toLowerCase() === owner.toLowerCase() ? 'owner' : 'not owner'

console.log(`\nname        ${name}`)
console.log(`registry    ${REGISTRY}`)
console.log(`resolver    ${resolver}`)
console.log(`token owner ${owner}\n`)

console.log('REGISTRY roles — move with the token (_update → _transferRoles)')
for (const [tag, account] of [
  ['seller', seller],
  ['buyer ', buyer],
] as const) {
  const bitmap = await client.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: 'roles',
    args: [tokenId, account as Address],
  })
  console.log(
    `  ${tag} ${short(account)} (${who(account).padEnd(9)}) ${decode(bitmap, REGISTRY_ROLES)}`,
  )
}

console.log('\nRESOLVER roles — nothing in the transfer flow touches these')
const resource = nameResource(name)
for (const [tag, account] of [
  ['seller', seller],
  ['buyer ', buyer],
] as const) {
  const rootBitmap = await client.readContract({
    address: resolver,
    abi: resolverAbi,
    functionName: 'roles',
    args: [0n, account as Address],
  })
  const nameBitmap = await client.readContract({
    address: resolver,
    abi: resolverAbi,
    functionName: 'roles',
    args: [resource, account as Address],
  })
  // The exact question the portal's useCanEditRecords asks before showing the editor.
  const canWrite = await client.readContract({
    address: resolver,
    abi: resolverAbi,
    functionName: 'hasRoles',
    args: [resource, RESOLVER_ROLES.ROLE_SET_ADDR, account as Address],
  })
  const via = canWrite
    ? nameBitmap !== 0n
      ? 'name grant'
      : 'ROOT wildcard'
    : '—'
  console.log(`  ${tag} ${short(account)}`)
  console.log(`    root resource  ${decode(rootBitmap, RESOLVER_ROLES)}`)
  console.log(`    ${name.padEnd(14)} ${decode(nameBitmap, RESOLVER_ROLES)}`)
  console.log(`    can setAddr?   ${canWrite ? 'YES' : 'no '}   via ${via}\n`)
}
