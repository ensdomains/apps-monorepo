import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { decodeFuses } from '@ensdomains/ensjs/utils'
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

export const getBurnedFuseCount = ResultFn(async function* ({
  name,
}: BurnedFuseCountParameters) {
  const wrapperData = yield* getNameWrapperData({ name })

  if (!wrapperData) return ok(0)

  const { fuses } = wrapperData

  const count = (
    obj: Record<string, boolean | Record<string, boolean>>,
  ): number =>
    Object.values(obj).reduce<number>((acc, cur) => {
      if (typeof cur === 'boolean') return acc + (cur ? 1 : 0)
      return acc + Object.values(cur).filter(Boolean).length
    }, 0)

  const totalBurned = count(fuses.child) + count(fuses.parent)

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
