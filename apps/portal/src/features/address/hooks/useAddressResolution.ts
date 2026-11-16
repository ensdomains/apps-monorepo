import { isAddressLikeName } from '@ens-apps/utils/addressLikeName'
import { useQuery } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { type Address, isAddress } from 'viem'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { isNameOrAddress } from '@/utils/token/isNameOrAddress'
import { getResolvedAddressQueryOptions } from '../queries/getResolvedAddress'

const DEBOUNCE_MS = 500

export type AddressResolutionStatus =
  /** No (non-whitespace) input yet. */
  | 'empty'
  /** Non-empty, but not a syntactically valid ENS name or 0x address. */
  | 'invalid'
  /** A name that reads like a wallet address, so it is never resolved. */
  | 'address-like'
  /** Valid input; debouncing or fetching the resolution. */
  | 'resolving'
  /** Resolved to an address. */
  | 'resolved'
  /** Valid input, but no address could be resolved for it. */
  | 'unresolved'
  /** Valid input, but the resolution query threw (network/client error). */
  | 'error'

export type AddressResolution = {
  /** Resolved address; non-null only when `status === 'resolved'`. */
  readonly address: Address | null
  /** True while debouncing or fetching a valid input. */
  readonly isResolving: boolean
  /** Whether the trimmed input is a syntactically valid name or address. */
  readonly isValid: boolean
  /** Whether the trimmed input is a raw 0x address (vs. a name to resolve). */
  readonly isRawAddress: boolean
  /** True when the input is present but can't be used (invalid/unresolved/error). */
  readonly isInvalid: boolean
  readonly status: AddressResolutionStatus
}

/**
 * Resolve a name/address input to an address, with debouncing and derived UI
 * state. Raw addresses resolve immediately; names are debounced. The single
 * source of truth is the `input` string — clearing it resets all state.
 *
 * Shared by every "name or address" input in the app (transfer recipient,
 * add-user sheets, …). Pair with `AddressNameInput` for the standard field UI,
 * or read `status`/`address` directly for a custom presentation.
 */
export const useAddressResolution = (input: string): AddressResolution => {
  const trimmed = input.trim()
  const isRawAddress = isAddress(trimmed, { strict: false })
  // Addresses resolve instantly; names are debounced.
  const debounced = useDebouncedValue(trimmed, isRawAddress ? 0 : DEBOUNCE_MS)

  const isValid = trimmed.length > 0 && isNameOrAddress(trimmed)
  // Such a name gets passed off as the address it spells, so make the user paste that.
  const isAddressLike = !isRawAddress && isAddressLikeName(trimmed)
  const canResolve = isValid && !isAddressLike
  const isDebouncing = debounced !== trimmed

  const {
    data: resolved = null,
    isFetching,
    isError,
  } = useQuery({
    ...getResolvedAddressQueryOptions({ nameOrAddress: debounced }),
    enabled: canResolve && !isDebouncing,
  })

  const isResolving = canResolve && (isDebouncing || isFetching)

  const status = match({
    isEmpty: trimmed.length === 0,
    isAddressLike,
    isValid,
    isResolving,
    isError: canResolve && isError,
    resolved,
  })
    .with({ isEmpty: true }, () => 'empty' as const)
    .with({ isValid: false }, () => 'invalid' as const)
    .with({ isAddressLike: true }, () => 'address-like' as const)
    .with({ isResolving: true }, () => 'resolving' as const)
    .with({ resolved: P.nonNullable }, () => 'resolved' as const)
    .with({ isError: true }, () => 'error' as const)
    .otherwise(() => 'unresolved' as const)

  return {
    address: status === 'resolved' ? resolved : null,
    isResolving,
    isValid,
    isRawAddress,
    isInvalid:
      status === 'invalid' ||
      status === 'address-like' ||
      status === 'unresolved' ||
      status === 'error',
    status,
  }
}
