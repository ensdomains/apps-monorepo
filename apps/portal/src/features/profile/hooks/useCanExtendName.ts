import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type RenewNamesWriteParametersErrorType,
  renewNamesWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { fromPromise, fromThrowable, ok } from 'neverthrow'
import { type EstimateGasErrorType, estimateGas } from 'viem/actions'
import type { GetConnectorClientData } from 'wagmi/query'
import type { wagmiConfig } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

class CanExtendNameError extends TaggedError('CanExtendNameError')<{
  cause: EstimateGasErrorType | RenewNamesWriteParametersErrorType
}> {}

export const canExtendName = ResultFn(async function* ({
  name,
  connectorClient,
}: CanExtendNameParameters) {
  const client = yield* safeGetClient()

  const safeGetParameters = fromThrowable(
    () =>
      renewNamesWriteParameters(connectorClient, {
        nameOrNames: name,
        value: 1n,
        duration: 60n,
      }),
    (e) =>
      new CanExtendNameError({
        cause: e as RenewNamesWriteParametersErrorType,
      }),
  )

  const parameters = yield* safeGetParameters()

  const gasResult = await fromPromise(
    estimateGas(client, parameters),
    (e) => new CanExtendNameError({ cause: e as EstimateGasErrorType }),
  )

  return ok(!(gasResult.isErr() || gasResult.value === 0n))
})

export const canExtendNameQueryKey = createQueryKey<
  'canExtendNameQueryKey',
  CanExtendNameParameters
>('canExtendNameQueryKey')

export type CanExtendNameParameters = {
  name: string
  connectorClient: GetConnectorClientData<typeof wagmiConfig, 1>
}

export const getCanExtendNameQueryOptions = (params: CanExtendNameParameters) =>
  resultQueryOptions({
    queryKey: canExtendNameQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => canExtendName(params),
  })
