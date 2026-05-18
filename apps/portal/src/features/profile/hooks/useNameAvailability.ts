import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { readContract } from 'viem/actions'
import { ethRegistrarIsAvailableAbi } from '@/lib/abis/ethRegistrar'
import { safeGetClient } from '@/lib/wagmi/helpers'

const ethRegistrar = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

export class CheckNameAvailabilityError extends TaggedError(
  'CheckNameAvailabilityError',
)<{
  cause: unknown
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
      abi: ethRegistrarIsAvailableAbi,
      functionName: 'isAvailable',
      args: [cleanName],
    }),
    (e) => new CheckNameAvailabilityError({ cause: e }),
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
