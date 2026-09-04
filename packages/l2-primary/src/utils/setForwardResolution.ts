/**
 * Utility for creating forward resolution (name → address) contract calls
 *
 * Returns contract parameters for calling setAddr on the resolver.
 * Uses ensjs setAddrParameters for correct address encoding.
 *
 * The write always targets the name's resolver on L1, whatever coin type the
 * record is for: per ENSIP-19 an L2 primary name is verified against the
 * name's `addr(node, l2CoinType)` record, which lives on the L1 resolver just
 * like the coin-60 record.
 */

import { setAddrParameters } from '@ensdomains/ensjs/utils'
import type { Address, Hex } from 'viem'
import { parseAbi, toHex, zeroAddress } from 'viem'
import { packetToBytes } from 'viem/ens'

/**
 * Post-audit-2 `PermissionedResolver.setAddress` (contracts-v2 PR #417): takes
 * the DNS-encoded name instead of a node. ensjs still encodes the legacy
 * `setAddr(node, coinType, bytes)`, so the encoded address bytes are reused
 * and only the selector and name change.
 */
const permissionedResolverSetAddressAbi = parseAbi([
  'function setAddress(bytes name, uint256 coinType, bytes addressBytes)',
])

type LegacySetAddrRequest = ReturnType<typeof setAddrParameters> & {
  address: Address
}

type PermissionedSetAddressRequest = {
  address: Address
  abi: typeof permissionedResolverSetAddressAbi
  functionName: 'setAddress'
  args: readonly [name: Hex, coinType: bigint, addressBytes: Hex]
}

export type SetForwardResolutionRequest =
  | LegacySetAddrRequest
  | PermissionedSetAddressRequest

/**
 * Creates contract call parameters for setting forward resolution.
 *
 * @param coinType ENSIP-9/11 coin type the address record is keyed on: `60`
 * for Ethereum, `0x80000000 | chainId` for EVM L2s (environment-derived, e.g.
 * Scroll Sepolia → `0x8008274f`), `0x80000000` for the default record.
 * @param permissioned Target a post-audit-2 `PermissionedResolver`, whose
 * setters take the DNS-encoded name rather than a node.
 */
export function createSetForwardResolutionRequest({
  name,
  coinType,
  resolverAddress,
  targetAddress,
  permissioned = false,
}: {
  name: string | undefined
  coinType: number
  resolverAddress: Address | null | undefined
  targetAddress: Address
  permissioned?: boolean
}): SetForwardResolutionRequest {
  if (!name) {
    throw new Error('No name provided')
  }

  if (!resolverAddress || resolverAddress === zeroAddress) {
    throw new Error(
      `No resolver found for name: ${name}. Set a resolver for this name first (e.g. via the Manager app).`,
    )
  }

  if (resolverAddress.toLowerCase() === targetAddress.toLowerCase()) {
    throw new Error(
      `The resolver for ${name} is set to your own address (${resolverAddress}), which is not a valid resolver contract. Update the resolver for this name to a valid resolver contract (e.g. the Public Resolver) before setting forward resolution.`,
    )
  }

  const setAddr = setAddrParameters({
    name,
    coin: coinType,
    value: targetAddress,
  })

  if (permissioned) {
    const [, encodedCoinType, addressBytes] = setAddr.args as readonly [
      Hex,
      bigint,
      Hex,
    ]
    return {
      address: resolverAddress,
      abi: permissionedResolverSetAddressAbi,
      functionName: 'setAddress',
      args: [toHex(packetToBytes(name)), encodedCoinType, addressBytes],
    }
  }

  return {
    address: resolverAddress,
    ...setAddr,
  }
}
