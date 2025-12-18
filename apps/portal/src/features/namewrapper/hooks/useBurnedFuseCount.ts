import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { DecodedFuses } from '@ensdomains/ensjs/utils'
import { ok } from 'neverthrow'
import {
  type GetNameWrapperDataError,
  type GetNameWrapperDataParameters,
  getNameWrapperData,
} from './useNameWrapperData'

export class BurnedFuseCountError extends TaggedError('BurnedFuseCountError')<{
  cause: GetNameWrapperDataError
}> {}

export type BurnedFuseCountParameters = GetNameWrapperDataParameters

const countBurned = (
  f: DecodedFuses['child'] | DecodedFuses['parent'],
): number =>
  Object.values(f).reduce<number>((acc, v) => {
    if (typeof v === 'boolean') return acc + (v ? 1 : 0)
    return acc + countBurned(v) // recurse
  }, 0)

export const getBurnedFuseCount = ResultFn(async function* ({
  name,
}: BurnedFuseCountParameters) {
  const wrapperData = yield* getNameWrapperData({ name })

  if (!wrapperData) return ok(0)

  const { fuses } = wrapperData

  const totalBurned = countBurned(fuses.child)

  return ok(totalBurned)
})

export const burnedFuseCountQueryKey = createQueryKey<
  'burnedFuseCountQueryKey',
  BurnedFuseCountParameters
>('burnedFuseCountQueryKey')

export const getBurnedFuseCountQueryOptions = (
  params: BurnedFuseCountParameters,
) =>
  resultQueryOptions({
    queryKey: burnedFuseCountQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getBurnedFuseCount(p),
  })
