import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { l2EthRegistrarIsAvailableSnippet } from '@ensdomains/ensjs/contracts'
import { fromPromise, ok } from 'neverthrow'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isValidEnsName } from '@/utils/token/isNormalized'
import { fastTestETHRegistrar } from '../../../lib/constants/registry'

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
 * Check if a name is available for registration using the FastTestETHRegistrar.
 * This checks availability on the V2 registrar on Sepolia.
 */
export const checkNameAvailability = ResultFn(async function* ({
  name,
}: CheckNameAvailabilityParameters) {
  const client = yield* safeGetClient()

  // Remove .eth suffix if present
  const cleanName = name.replace(/\.eth$/i, '')

  // Reject invalid ENS names before calling the contract
  const nameToValidate = cleanName.includes('.')
    ? cleanName
    : `${cleanName}.eth`
  if (!isValidEnsName(nameToValidate.toLowerCase())) {
    return ok<CheckNameAvailabilityReturnType>({
      isAvailable: false,
      name: `${cleanName}.eth`,
    })
  }

  const isAvailable = yield* fromPromise(
    readContract(client, {
      address: fastTestETHRegistrar,
      abi: l2EthRegistrarIsAvailableSnippet,
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
