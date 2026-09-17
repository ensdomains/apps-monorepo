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
import { setAddressParameters } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'

export type SetForwardResolutionRequest = { address: Address } & (
  | ReturnType<typeof setAddrParameters>
  | ReturnType<typeof setAddressParameters>
)

/**
 * Creates contract call parameters for setting forward resolution.
 *
 * @param coinType ENSIP-9/11 coin type the address record is keyed on: `60`
 * for Ethereum, `0x80000000 | chainId` for EVM L2s (environment-derived, e.g.
 * Scroll Sepolia → `0x8008274f`), `0x80000000` for the default record.
 * @param permissioned Target a V2 `PermissionedResolver`, whose setter is
 * `setAddress(bytes name, ...)` rather than `setAddr(bytes32 node, ...)`. The
 * v1 encoding hits the V2 resolver's fallback and reverts with empty data.
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

  const setAddr = permissioned
    ? setAddressParameters({ name, coin: coinType, value: targetAddress })
    : setAddrParameters({ name, coin: coinType, value: targetAddress })

  return {
    address: resolverAddress,
    ...setAddr,
  }
}
