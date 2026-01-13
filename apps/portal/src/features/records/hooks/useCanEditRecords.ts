import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { publicResolverSetAddrSnippet } from '@ensdomains/ensjs/contracts'
import { EMPTY_ADDRESS } from '@ensdomains/ensjs/utils'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, fromThrowable, ok } from 'neverthrow'
import type { Address } from 'viem/accounts'
import {
  type EstimateGasErrorType,
  estimateGas,
  type GetEnsResolverErrorType,
  getEnsResolver,
} from 'viem/actions'
import { type NamehashErrorType, namehash } from 'viem/ens'
import {
  type EncodeFunctionDataErrorType,
  encodeFunctionData,
} from 'viem/utils'
import { wagmiConfig } from '@/lib/wagmi'
import { safeGetClient, safeGetConnectorClient } from '@/lib/wagmi/helpers'

class CanEditRecordsError extends TaggedError('CanEditRecordsError')<{
  cause:
    | EncodeFunctionDataErrorType
    | EstimateGasErrorType
    | NamehashErrorType
    | GetEnsResolverErrorType
}> {}

const canEditRecords = ResultFn(async function* ({
  name,
  resolverAddress,
}: CanEditRecordsParameters) {
  const client = yield* safeGetClient()

  const safeNamehash = fromThrowable(
    () => namehash(name),
    (e) => new CanEditRecordsError({ cause: e as NamehashErrorType }),
  )

  const node = yield* safeNamehash()

  // TODO: if `setAddr` fails, we should try other interfaces
  const safeEncodeFunctionData = fromThrowable(
    () =>
      encodeFunctionData({
        abi: publicResolverSetAddrSnippet,
        args: [node, 60n, EMPTY_ADDRESS],
      }),
    (e) => new CanEditRecordsError({ cause: e as EncodeFunctionDataErrorType }),
  )

  const data = yield* safeEncodeFunctionData()

  const safeGetEnsResolver = fromPromise(
    getEnsResolver(client, { name }),
    (e) => new CanEditRecordsError({ cause: e as GetEnsResolverErrorType }),
  )

  if (!resolverAddress) resolverAddress = yield* await safeGetEnsResolver

  const connectorClient = yield* safeGetConnectorClient(wagmiConfig)

  const gasResult = await fromPromise(
    estimateGas(client, {
      to: resolverAddress,
      account: connectorClient.account,
      data,
    }),
    (e) => new CanEditRecordsError({ cause: e as EstimateGasErrorType }),
  )

  return ok(!(gasResult.isErr() || gasResult.value === 0n))
})

const canEditRecordsQueryKey = createQueryKey<
  'canEditRecordsQueryKey',
  CanEditRecordsParameters
>('canEditRecordsQueryKey')

type CanEditRecordsParameters = {
  name: string
  resolverAddress?: Address
}

const getCanEditRecordsQueryOptions = (params: CanEditRecordsParameters) =>
  resultQueryOptions({
    queryKey: canEditRecordsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => canEditRecords(params),
  })

export const useCanEditRecords = (params: CanEditRecordsParameters) =>
  useQuery(getCanEditRecordsQueryOptions(params))
