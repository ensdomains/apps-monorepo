import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import type { ProtocolVersion } from '@/utils/types'

const OWNED_NAMES = 'owned-names'

export const getOwnedNamesQueryKey = createQueryKey<
  typeof OWNED_NAMES,
  {
    readonly address: Address
    readonly protocolVersion: ProtocolVersion
    readonly search?: string
  }
>(OWNED_NAMES)

/** Matches the owned-names queries of every address and protocol version. */
export const ALL_OWNED_NAMES_QUERY_KEY = [OWNED_NAMES] as const
