import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getNameRegistries as ensjsGetNameRegistries,
  type GetNameRegistriesErrorType,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import type { GetEnsOwnerError } from '@/features/profile/hooks/useEnsOwner'
import { safeGetClient } from '@/lib/wagmi/helpers'
import type { ProtocolVersion } from '@/utils/types'

type GetNameRegistriesParameters = {
  name: string
}

type Root = [root: Address | null]
type TLD = [tld: Address, ...Root]
type TwoLD = [nameOrZero: Address, ...TLD]
type ThreeLD = [nameAddress: Address, ...TwoLD]

type NameRegistries = Root | TLD | TwoLD | ThreeLD

type NameRegistriesReturnType = {
  registries: NameRegistries
  protocolVersion: ProtocolVersion
} | null

class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType | GetEnsOwnerError
}> {}

/**
 * Discovers which registries a name exists on using the UniversalResolver V2.
 *
 * Uses ensjs getNameRegistries which calls findRegistries on the UniversalResolver.
 * For V2 registries, this efficiently fetches all registry addresses at once.
 */
export const getNameRegistries = ResultFn(async function* ({
  name,
}: GetNameRegistriesParameters) {
  const client = yield* safeGetClient()

  const registries = (yield* fromPromise(
    ensjsGetNameRegistries(client, { name }),
    (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
  )) as NameRegistries

  return ok({
    registries,
    protocolVersion: 'ENSv2' as ProtocolVersion,
  } satisfies NameRegistriesReturnType)
})

const nameRegistriesQueryKey = createQueryKey<
  'nameRegistries',
  GetNameRegistriesParameters
>('nameRegistries')

export const getNameRegistriesQueryOptions = (
  params: GetNameRegistriesParameters,
) =>
  resultQueryOptions({
    queryKey: nameRegistriesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameRegistries(params),
  })
