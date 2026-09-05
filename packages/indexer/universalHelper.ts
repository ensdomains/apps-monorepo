/**
 * Registry-walking reads for the hackathon Sepolia deployment.
 *
 * That deployment moved the registry-walk views off the UniversalResolver onto
 * a standalone `UniversalHelper` contract, and split the old
 * `findOwner(bytes)` into two functions:
 *
 *   - `findExactOwner(bytes)`   — owner of exactly this name, zero if unowned
 *     (the old `findOwner` semantics)
 *   - `findNearestOwner(bytes)` — owner of the closest owned ancestor
 *
 * ensjs (@377) still points `getOwner` (`findOwner`), `getNameRegistries`
 * (`findRegistries`) and `getAvailable`'s eth-subname branch
 * (`findParentRegistry`) at `ensUniversalResolver`, where all three now revert
 * with empty data. The apps therefore go through this module instead of the
 * ensjs v2 actions of the same name.
 *
 * `findResolver` stayed on the UniversalResolver, so every ensjs *resolution*
 * action (getResolver, getRecords, getName, resolveNameData, ccipRequest, …)
 * is unaffected and keeps using the chain's `ensUniversalResolver`.
 *
 * `getAvailable` is likewise untouched here: the portal only ever calls it with
 * an eth-2ld, which reads `ensEthRegistrar.isAvailable` and never reaches
 * `findParentRegistry`. Add a wrapper here if a subname availability check is
 * introduced.
 */
import {
  type Address,
  type Chain,
  type Client,
  type Transport,
  toHex,
} from 'viem'
import { readContract } from 'viem/actions'
import { packetToBytes } from 'viem/ens'
import { getAction } from 'viem/utils'

/**
 * `UniversalHelper` from the 2026-09-03 clean-testnet deployment. Hardcoded
 * for the same reason as `V1_SUBGRAPH_URL` in `./chain.ts`: ensjs has no
 * chain-contract key for it, so it cannot be supplied through the chain config.
 */
export const UNIVERSAL_HELPER_ADDRESS =
  '0x1d4cd7545d456f3b6A7E4380182279AFcFa887b6' as const

export const universalHelperFindExactOwnerSnippet = [
  {
    inputs: [{ name: 'name', type: 'bytes' }],
    name: 'findExactOwner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const universalHelperFindRegistriesSnippet = [
  {
    inputs: [{ name: 'name', type: 'bytes' }],
    name: 'findRegistries',
    outputs: [
      { internalType: 'contract IRegistry[]', name: '', type: 'address[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/**
 * Owner of exactly `name`, or the zero address when it (or any ancestor
 * registry on its path) is unowned. Drop-in replacement for ensjs's
 * `getOwner` from `@ensdomains/ensjs/public/v2`.
 */
export async function getOwner<chain extends Chain>(
  client: Client<Transport, chain>,
  { name }: { name: string },
): Promise<Address> {
  const readContractAction = getAction(client, readContract, 'readContract')

  return readContractAction({
    address: UNIVERSAL_HELPER_ADDRESS,
    abi: universalHelperFindExactOwnerSnippet,
    functionName: 'findExactOwner',
    args: [toHex(packetToBytes(name))],
  })
}

/**
 * Every registry in the ancestry of `name`, leaf-first:
 * `[registryOf(leaf), registryContaining(leaf), ..., root]`. Drop-in
 * replacement for ensjs's `getNameRegistries` from
 * `@ensdomains/ensjs/public/v2`.
 */
export async function getNameRegistries<chain extends Chain>(
  client: Client<Transport, chain>,
  { name }: { name: string },
): Promise<readonly Address[]> {
  const readContractAction = getAction(client, readContract, 'readContract')

  return readContractAction({
    address: UNIVERSAL_HELPER_ADDRESS,
    abi: universalHelperFindRegistriesSnippet,
    functionName: 'findRegistries',
    args: [toHex(packetToBytes(name))],
  })
}
