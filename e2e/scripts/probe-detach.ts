/**
 * Probe: can the owner of a name actually run the transfer flow's steps?
 *
 * Simulates each call `buildTransferPlan` emits, in the order it emits them,
 * via `eth_call` — nothing is mined, so this is safe to run against a name you
 * care about. Reverts are decoded against the registry's own error ABIs, so an
 * authorization failure reads as `EACUnauthorizedAccountRoles(...)` rather than
 * a bare selector.
 *
 * This is what confirmed WEB-446 before any UI was involved: for a migrated
 * *locked* name, `setResolver(0)` succeeds while `setSubregistry(0)` reverts —
 * and since the plan runs the resolver step first, the irreversible one landed
 * before the impossible one failed.
 *
 *   npx tsx scripts/probe-detach.ts <label>
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getTokenId } from '@ensdomains/ensjs/public/v2'
import { eacErrors } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
  permissionedRegistrySetResolverSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { userRegistrySetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  decodeErrorResult,
  encodeFunctionData,
  erc1155Abi,
  type Hex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, testClient } from '../helpers/anvil-client.js'

const REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address

const OWNER = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)
const RECIPIENT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const label = process.argv[2]
if (!label) throw new Error('usage: probe-detach.ts <label>')

/**
 * Pull the raw revert data out of a viem error. Anvil surfaces an undecodable
 * custom error as `custom error 0xSELECTOR: ARGS` — with the args hex *not*
 * `0x`-prefixed — so the two halves have to be stitched back together before
 * they can be decoded.
 */
function revertData(err: unknown): Hex | undefined {
  const e = err as Error & { data?: Hex }
  if (e.data) return e.data

  const text = [
    e.message,
    ...((e as { metaMessages?: string[] }).metaMessages ?? []),
  ].join(' ')
  const split = /custom error (0x[0-9a-fA-F]{8}):\s*([0-9a-fA-F]*)/.exec(text)
  if (split) return `${split[1]}${split[2]}` as Hex

  const bare = /0x[0-9a-fA-F]{8,}/.exec(text)?.[0]
  return bare ? (bare as Hex) : undefined
}

/** Decode a revert against the registry's error ABIs; fall back to raw data. */
function explainRevert(err: unknown): string {
  const raw = revertData(err)
  if (raw) {
    try {
      const decoded = decodeErrorResult({ abi: eacErrors, data: raw })
      const args = (decoded.args ?? []).map((a) =>
        typeof a === 'bigint' ? `0x${a.toString(16)}` : String(a),
      )
      return `${decoded.errorName}(${args.join(', ')})`
    } catch {
      // Not an EAC error — fall through to the raw message.
    }
  }
  return (err as Error).message.split('\n')[0]
}

/** Simulate a call as OWNER; report whether it would succeed. */
async function trySim(name: string, data: Hex): Promise<void> {
  try {
    await publicClient.call({ account: OWNER.address, to: REGISTRY, data })
    console.log(`  ✅ ${name} — would succeed`)
  } catch (err) {
    console.log(`  ❌ ${name} — REVERTS: ${explainRevert(err)}`)
  }
}

async function main() {
  // Anvil's well-known accounts carry squatted EIP-7702 delegation code on the
  // Sepolia fork, which makes them non-conforming ERC1155 receivers and reverts
  // `safeTransferFrom` for reasons unrelated to roles. Clear it first — the
  // portal fixture does the same (see playwright.portal.fixture.ts).
  await testClient.setCode({ address: RECIPIENT, bytecode: '0x' })

  const tokenId = await getTokenId(publicClient as never, {
    label,
    registryAddress: REGISTRY,
  })
  const [resolver, subregistry] = await Promise.all([
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

  console.log(`\n${label}.eth`)
  console.log(`  resolver=${resolver}`)
  console.log(`  subregistry=${subregistry}`)
  console.log(`  → transfer plan steps, simulated as the owner:\n`)

  await trySim(
    'detach-resolver  setResolver(0x0)',
    encodeFunctionData({
      abi: permissionedRegistrySetResolverSnippet,
      functionName: 'setResolver',
      args: [tokenId, zeroAddress],
    }),
  )

  await trySim(
    'detach-registry  setSubregistry(0x0)',
    encodeFunctionData({
      abi: userRegistrySetSubregistrySnippet,
      functionName: 'setSubregistry',
      args: [tokenId, zeroAddress],
    }),
  )

  // v2 names are ERC-1155 tokens in their leaf registry — ownership moves via
  // the standard `safeTransferFrom`, same as the app's transferToken.ts.
  await trySim(
    'transfer-token   safeTransferFrom',
    encodeFunctionData({
      abi: erc1155Abi,
      functionName: 'safeTransferFrom',
      args: [OWNER.address, RECIPIENT, tokenId, 1n, '0x'],
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
