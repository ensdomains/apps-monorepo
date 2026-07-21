import type { Address } from 'viem'
import { getEnsContractName } from '@/utils/ens/ensContractNames'

/**
 * Human label for the contract that emitted an event (resolver / registrar / registry
 * / controller …). Falls back to `undefined` when the address is not a known ENS
 * contract — callers then show a truncated address.
 *
 * TODO: surface "permissioned registry" for indexed subregistries not in the static
 * ENS contract map (use the event `protocol` / a registries lookup).
 */
export const getContractLabel = (
  chainId: number,
  address?: string | null,
): string | undefined =>
  address ? getEnsContractName(chainId, address as Address) : undefined
