import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  getExpiry as ensjsv1_getExpiry,
  type GetExpiryErrorType as GetV1ExpiryErrorType,
  type GetExpiryReturnType as GetV1ExpiryReturnType,
} from '@ensdomains/ensjs/public/v1'
import {
  getExpiry as ensjsv2_getExpiry,
  getRegistrationDate as ensjsv2_getRegistrationDate,
  type GetRegistrationDateErrorType,
  type GetExpiryErrorType as GetV2ExpiryErrorType,
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

export type ProfileExpiryResult = {
  readonly expiry: bigint | null
  readonly isNonExpiring: boolean
  readonly protocol: 'v1' | 'v2'
}

export const getProfileExpiryResultStatus = (
  expiry: ProfileExpiryResult | null | undefined,
): NameExpiryStatus =>
  getProfileNameExpiryStatus(expiry?.expiry, expiry?.protocol !== 'v1')

class GetProfileExpiryError extends TaggedError('GetProfileExpiryError')<{
  cause:
    | GetV1ExpiryErrorType
    | GetV2ExpiryErrorType
    | GetRegistrationDateErrorType
}> {}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

const normalizeV1Expiry = (
  expiry: GetV1ExpiryReturnType,
): ProfileExpiryResult => {
  if (expiry?.expiry === 0n) {
    return { expiry: null, isNonExpiring: true, protocol: 'v1' }
  }

  return {
    expiry: expiry?.expiry ?? null,
    isNonExpiring: false,
    protocol: 'v1',
  }
}

export const getExpiry = ResultFn(async function* (name: string) {
  const ethName = normalizeEth2LdName(name)

  if (!ethName) {
    return ok({
      expiry: null,
      isNonExpiring: false,
      protocol: 'v2',
    } satisfies ProfileExpiryResult)
  }

  const client = yield* safeGetClient()

  const expiry = yield* fromPromise(
    ensjsv2_getExpiry(client, {
      name: ethName.name,
      registryAddress: ENS_REGISTRY,
    }),
    (e) => new GetProfileExpiryError({ cause: e as GetV2ExpiryErrorType }),
  )

  if (expiry !== 0n) {
    return ok({
      expiry,
      isNonExpiring: false,
      protocol: 'v2',
    } satisfies ProfileExpiryResult)
  }

  const registrationDate = yield* fromPromise(
    ensjsv2_getRegistrationDate(client, {
      label: ethName.label,
      registryAddress: ENS_REGISTRY,
    }),
    (e) =>
      new GetProfileExpiryError({
        cause: e as GetRegistrationDateErrorType,
      }),
  )

  if (registrationDate === null) {
    const v1Expiry = yield* fromPromise(
      ensjsv1_getExpiry(client, { name: ethName.name }),
      (e) =>
        new GetProfileExpiryError({
          cause: e as GetV1ExpiryErrorType,
        }),
    )

    return ok(normalizeV1Expiry(v1Expiry))
  }

  return ok({
    expiry: null,
    isNonExpiring: true,
    protocol: 'v2',
  } satisfies ProfileExpiryResult)
})

export const profileExpiryQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getExpiry(name),
  })
