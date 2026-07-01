import { useQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { type Address, isAddress } from 'viem'
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { wagmiConfig } from '@/lib/wagmi'
import { isNameOrAddress } from '@/utils/token/isNameOrAddress'

// Module-level client for resolution — matches RegistryAddUserSheet, which
// resolves outside any hook against the same wagmi config client.
const client = wagmiConfig.getClient()
const DEBOUNCE_MS = 500

export type RecipientResolution = {
  /** Resolved recipient address, or null while empty / invalid / unresolved. */
  readonly address: Address | null
  readonly isResolving: boolean
  readonly error: string | null
}

/**
 * Resolve a recipient input (an ENS name or a 0x address) to an address.
 * Addresses resolve immediately; names are debounced and resolved via the
 * universal resolver (falling back to the ENS owner if no address record).
 */
export const useRecipientResolution = (input: string): RecipientResolution => {
  const trimmed = input.trim()
  // Addresses resolve instantly; names are debounced.
  const debounced = useDebouncedValue(
    trimmed,
    isAddress(trimmed, { strict: false }) ? 0 : DEBOUNCE_MS,
  )

  const isValid = trimmed.length > 0 && isNameOrAddress(trimmed)
  const isDebouncing = debounced !== trimmed

  const { data: resolved = null, isFetching } = useQuery({
    queryKey: ['recipient-resolution', debounced],
    queryFn: () => resolveAddressOrName({ client, nameOrAddress: debounced }),
    enabled: isValid && !isDebouncing,
  })

  return match({
    trimmed,
    isValid,
    isPending: isDebouncing || isFetching,
    resolved,
  })
    .with({ trimmed: '' }, () => ({
      address: null,
      isResolving: false,
      error: null,
    }))
    .with({ isValid: false }, () => ({
      address: null,
      isResolving: false,
      error: 'Enter a valid ENS name or address',
    }))
    .with({ isPending: true }, () => ({
      address: null,
      isResolving: true,
      error: null,
    }))
    .with({ resolved: P.nonNullable }, ({ resolved }) => ({
      address: resolved,
      isResolving: false,
      error: null,
    }))
    .otherwise(() => ({
      address: null,
      isResolving: false,
      error: 'Could not resolve a name or address',
    }))
}
