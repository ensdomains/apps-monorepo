import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  getRegistrationDate as ensjsv2_getRegistrationDate,
  type GetRegistrationDateErrorType,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeEth2LdName } from './profileName'

class GetProfileRegistrationError extends TaggedError(
  'GetProfileRegistrationError',
)<{
  cause: GetRegistrationDateErrorType
}> {}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

export const getRegistration = ResultFn(async function* (name: string) {
  const ethName = normalizeEth2LdName(name)

  if (!ethName) {
    return ok({ registrationDate: null })
  }

  const client = yield* safeGetClient()

  const registrationDate = yield* fromPromise(
    ensjsv2_getRegistrationDate(client, {
      label: ethName.label,
      registryAddress: ENS_REGISTRY,
    }),
    (e) =>
      new GetProfileRegistrationError({
        cause: e as GetRegistrationDateErrorType,
      }),
  )

  return ok({
    registrationDate:
      registrationDate === null ? null : Number(registrationDate),
  })
})

export const profileRegistrationQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'registration', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getRegistration(name),
  })
