import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { type Address, isAddress } from 'viem'
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isNameOrAddress } from '@/utils/token/isNameOrAddress'

const DEBOUNCE_MS = 500

interface GetRecipientAddressParams {
  readonly nameOrAddress: string
}

/**
 * Resolve a recipient input (an ENS name or a 0x address) to an address.
 * Addresses pass through; names go through the universal resolver, falling
 * back to the ENS owner when the name has no address record.
 */
export const getRecipientAddress = ResultFn(async function* (
  params: GetRecipientAddressParams,
) {
  const client = yield* safeGetClient()

  // `resolveAddressOrName` resolves to `Address | null` and never throws (it
  // swallows resolution failures to null), so there's nothing to wrap in a
  // Result error here.
  const address = await resolveAddressOrName({
    client,
    nameOrAddress: params.nameOrAddress,
  })

  return ok<Address | null>(address)
})

const getRecipientAddressQueryKey = createQueryKey<
  'recipient-address',
  GetRecipientAddressParams
>('recipient-address')

export const getRecipientAddressQueryOptions = (
  params: GetRecipientAddressParams,
) =>
  resultQueryOptions({
    queryKey: getRecipientAddressQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getRecipientAddress(queryParams),
  })

export type RecipientResolution = {
  /** Resolved recipient address, or null while empty / invalid / unresolved. */
  readonly address: Address | null
  readonly isResolving: boolean
  readonly error: string | null
}

/**
 * Resolve a recipient input to an address, with debouncing and UI state.
 * Addresses resolve immediately; names are debounced.
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
    ...getRecipientAddressQueryOptions({ nameOrAddress: debounced }),
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
