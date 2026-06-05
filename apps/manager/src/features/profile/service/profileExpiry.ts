import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  getExpiry as ensjsv2_getExpiry,
  type GetExpiryErrorType,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import {
  getNameExpiryStatus,
  type NameExpiryStatus,
} from '@/features/grace/utils/gracePeriod'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeEth2LdName } from './profileName'

export const profileExpiryDateFromSeconds = (
  expirySeconds: number | bigint | null | undefined,
): Date | null => {
  if (expirySeconds == null) return null
  const date = new Date(Number(expirySeconds) * 1000)
  return Number.isNaN(date.getTime()) ? null : date
}

export const getProfileNameExpiryStatus = (
  expirySeconds: number | bigint | null | undefined,
  isV2 = true,
): NameExpiryStatus =>
  getNameExpiryStatus(profileExpiryDateFromSeconds(expirySeconds), isV2)

class GetProfileExpiryError extends TaggedError('GetProfileExpiryError')<{
  cause: GetExpiryErrorType
}> {}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

export const getExpiry = ResultFn(async function* (name: string) {
  const ethName = normalizeEth2LdName(name)

  if (!ethName) {
    return ok({ expiry: null })
  }

  const client = yield* safeGetClient()

  const expiry = yield* fromPromise(
    ensjsv2_getExpiry(client, {
      name: ethName.name,
      registryAddress: ENS_REGISTRY,
    }),
    (e) => new GetProfileExpiryError({ cause: e as GetExpiryErrorType }),
  )

  if (expiry === 0n) {
    return ok({ expiry: null })
  }

  return ok({ expiry })
})

export const profileExpiryQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getExpiry(name),
  })
