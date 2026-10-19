import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getRegistrationDate as ensjsv2_getRegistrationDate } from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import { getNameDetail } from '@/features/shared/service/nameDetail'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeEth2LdName, normalizeEthName } from './profileName'
import { getOwner, type ProfileProtocol } from './profileOwner'

class GetProfileRegistrationError extends TaggedError(
  'GetProfileRegistrationError',
)<{
  cause: unknown
}> {}

class UnsafeRegistrationDateError extends TaggedError(
  'UnsafeRegistrationDateError',
)<{
  readonly registrationDate: string
}> {}

const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER)
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

const registrationDateToNumber = (registrationDate: bigint) => {
  if (
    registrationDate < MIN_SAFE_INTEGER_BIGINT ||
    registrationDate > MAX_SAFE_INTEGER_BIGINT
  ) {
    return err(
      new UnsafeRegistrationDateError({
        message: 'Registration date exceeds Number safe integer range',
        registrationDate: registrationDate.toString(),
      }),
    )
  }

  return ok(Number(registrationDate))
}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

const MS_PER_SECOND = 1000

// Every failure, an unindexed name and an indexer outage alike, answers null so
// the on-chain read below settles it rather than the query ending without a date.
const getIndexedRegistrationDate = (name: string): Promise<number | null> =>
  getNameDetail(name)
    .map((detail) =>
      detail?.registeredAt
        ? Math.floor(detail.registeredAt.getTime() / MS_PER_SECOND)
        : null,
    )
    .unwrapOr(null)

export const getRegistration = ResultFn(async function* (
  name: string,
  protocol?: ProfileProtocol,
) {
  const subname = normalizeEthName(name)

  // A subname is issued by its parent rather than registered with a registrar,
  // so the indexer is the only source for its date.
  if (subname && subname.parentLabelsRootFirst.length > 0) {
    return ok({
      registrationDate: await getIndexedRegistrationDate(subname.name),
    })
  }

  const ethName = normalizeEth2LdName(name)

  if (!ethName) {
    return ok({ registrationDate: null })
  }

  const indexedDate = await getIndexedRegistrationDate(ethName.name)

  if (indexedDate !== null) {
    return ok({ registrationDate: indexedDate })
  }

  const resolvedProtocol =
    protocol ?? (yield* getOwner({ name: ethName.name }))?.protocol ?? 'v2'

  // The index is the only source of an ENSv1 registration date.
  if (resolvedProtocol === 'v1') {
    return ok({ registrationDate: null })
  }

  const client = yield* safeGetClient()

  const registrationDate = yield* fromPromise(
    ensjsv2_getRegistrationDate(client, {
      label: ethName.label,
      registryAddress: ENS_REGISTRY,
    }),
    (e) => new GetProfileRegistrationError({ cause: e }),
  )

  const safeRegistrationDate =
    registrationDate === null
      ? null
      : yield* registrationDateToNumber(registrationDate)

  return ok({ registrationDate: safeRegistrationDate })
})

export const profileRegistrationQuery = (
  name: string,
  protocol?: ProfileProtocol,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'registration', { name, protocol }),
    queryFn: ({ queryKey: [{ name, protocol }] }) =>
      getRegistration(name, protocol),
  })
