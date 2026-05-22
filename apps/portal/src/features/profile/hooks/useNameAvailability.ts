import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { l2EthRegistrarIsAvailableSnippet } from '@ensdomains/ensjs/contracts'
import type { GetAvailableErrorType } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { readContract } from 'viem/actions'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class CheckNameAvailabilityError extends TaggedError(
  'CheckNameAvailabilityError',
)<{
  cause: GetAvailableErrorType
}> {}

type CheckNameAvailabilityParameters = {
  readonly name: string
}

export type CheckNameAvailabilityReturnType = {
  readonly isAvailable: boolean
  readonly name: string
}

/**
 * Check if a name is available for registration using the ETHRegistrar.
 * This checks availability on the V2 registrar on Sepolia.
 */
export const checkNameAvailability = ResultFn(async function* ({
  name,
}: CheckNameAvailabilityParameters) {
  const client = yield* safeGetClient()

  // Remove .eth suffix if present
  const cleanName = name.replace(/\.eth$/i, '')

  const isAvailable = yield* fromPromise(
    readContract(client, {
      address: ethRegistrar,
      abi: l2EthRegistrarIsAvailableSnippet,
      functionName: 'isAvailable',
      args: [cleanName],
    }),
    (e) =>
      new CheckNameAvailabilityError({ cause: e as GetAvailableErrorType }),
  )

  return ok<CheckNameAvailabilityReturnType>({
    isAvailable: Boolean(isAvailable),
    name: `${cleanName}.eth`,
  })
})

const checkNameAvailabilityQueryKey = createQueryKey<
  'check-name-availability',
  CheckNameAvailabilityParameters
>('check-name-availability')

export const getNameAvailabilityQueryOptions = (
  params: CheckNameAvailabilityParameters,
) =>
  resultQueryOptions({
    queryKey: checkNameAvailabilityQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => checkNameAvailability(params),
  })
