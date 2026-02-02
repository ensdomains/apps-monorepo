import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getAddressRecord } from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import { type Address, isAddress } from 'viem'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

export class ResolveAddressError extends TaggedError('ResolveAddressError')<{
  cause: unknown
}> {}

interface ResolveAddressParams {
  readonly input: string
}

export type ResolveAddressReturnType = Address | null

/**
 * Resolves an input string to an address.
 * If the input is already a valid address, returns it directly.
 * Otherwise, tries to resolve it as an ENS name.
 */
export const resolveAddress = ResultFn(async function* ({
  input,
}: ResolveAddressParams) {
  const trimmed = input.trim()

  if (!trimmed) {
    return ok<ResolveAddressReturnType>(null)
  }

  // If it's already a valid address, return it directly
  if (isAddress(trimmed)) {
    return ok<ResolveAddressReturnType>(trimmed)
  }

  // Try to resolve as ENS name
  const client = yield* safeGetNamechainSepoliaClient()

  try {
    const result = await getAddressRecord(client, { name: trimmed })
    if (result?.value) {
      return ok<ResolveAddressReturnType>(result.value as Address)
    }
    return ok<ResolveAddressReturnType>(null)
  } catch (error) {
    yield* new ResolveAddressError({ cause: error })
  }

  return ok<ResolveAddressReturnType>(null)
})

const resolveAddressQueryKey = createQueryKey<
  'resolve-address',
  ResolveAddressParams
>('resolve-address')

export const getResolveAddressQueryOptions = (params: ResolveAddressParams) =>
  resultQueryOptions({
    queryKey: resolveAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => resolveAddress(params),
    enabled: params.input.trim().length > 0,
  })
