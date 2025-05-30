import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { ok } from 'neverthrow'

export type EstimationFullRegistrationResult = {
  estimatedGasFee: bigint
  estimatedGasLoading: boolean
  yearlyFee: bigint
  totalDurationBasedFee: bigint
  hasPremium: boolean
  premiumFee: bigint
  gasPrice: bigint
  seconds: number
}

export class EstimationFullRegistrationError extends TaggedError(
  'EstimationFullRegistrationError',
)<{
  cause: unknown
}> {}

export const estimateFullRegistration = ResultFn(async function* ({
  seconds,
  name,
}: {
  seconds: number
  name: string
}) {

  // Dummy yield for now I will remove this once start doing the implementation on gas estimation
  yield* ok(undefined)

  console.log('name', name)
  const baseYearlyFee = 5000000000000000n
  const yearMultiplier = BigInt(
    Math.max(1, Math.floor(seconds / 31536000)),
  )

  return ok({
    estimatedGasFee: 2000000000000000n,
    estimatedGasLoading: false,
    yearlyFee: baseYearlyFee,
    totalDurationBasedFee: baseYearlyFee * yearMultiplier,
    hasPremium: false,
    premiumFee: 0n,
    gasPrice: 20000000000n,
    seconds: seconds,
  })
}) 

export const getEstimationFullRegistrationQueryOptions = (name: string, seconds: number) =>
  resultQueryOptions({
    queryKey: ['estimationFullRegistration', { name, seconds }],
    queryFn: ({ queryKey: [, { name, seconds }] }) => estimateFullRegistration({ name, seconds }),
  })