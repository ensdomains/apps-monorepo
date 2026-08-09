/**
 * Probe: did the registry actually emit `EACRolesChanged` for this label?
 *
 * The portal's Roles page rebuilds role holders by replaying that event from
 * the indexer (see `useNameRoleAccounts.ts`), so an empty page is ambiguous:
 * either the chain has no roles, or the indexer missed them. This reads the
 * event straight off the chain to tell the two apart — if the logs are here and
 * the indexer returns nothing, it's an indexer sync/config problem.
 *
 *   npx tsx scripts/probe-role-events.ts <label>
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getTokenId } from '@ensdomains/ensjs/public/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryGetResourceSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { publicClient } from '../helpers/anvil-client.js'

const REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address

/** How far back to scan; the local fork never has deep history. */
const SCAN_DEPTH = 200_000n

const label = process.argv[2]
if (!label) throw new Error('usage: probe-role-events.ts <label>')

async function main() {
  const tokenId = await getTokenId(publicClient as never, {
    label,
    registryAddress: REGISTRY,
  })
  const resource = await publicClient.readContract({
    address: REGISTRY,
    abi: permissionedRegistryGetResourceSnippet,
    functionName: 'getResource',
    args: [tokenId],
  })

  const latest = await publicClient.getBlockNumber()
  const fromBlock = latest > SCAN_DEPTH ? latest - SCAN_DEPTH : 0n

  console.log(`registry ${REGISTRY}`)
  console.log(`${label}.eth  resource=${resource}`)
  console.log(`scanning blocks ${fromBlock}–${latest}\n`)

  const [event] = eacRolesChangedEventSnippet
  const logs = await publicClient.getLogs({
    address: REGISTRY,
    event,
    args: { resource },
    fromBlock,
    toBlock: latest,
  })

  if (logs.length === 0) {
    console.log('  ❌ NO EACRolesChanged events on-chain for this resource')
    return
  }

  console.log(`  ✅ ${logs.length} EACRolesChanged event(s) on-chain:`)
  for (const l of logs) {
    const { account, oldRoleBitmap, newRoleBitmap } = l.args
    console.log(
      `    block ${l.blockNumber}  account=${account}  0x${oldRoleBitmap?.toString(16)} → 0x${newRoleBitmap?.toString(16)}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
