import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNameRolesAccountsErrorType,
  GetNameRolesAccountsParameters,
  GetNameRolesAccountsReturnType,
} from '@ensdomains/ensjs/public/v2'
import { getNameRoleAccounts as ensjs_getNameRoleAccounts } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetNameRolesAccountsError extends TaggedError(
  'GetNameRolesAccountsError',
)<{
  cause: GetNameRolesAccountsErrorType
}> {}

export const getNameRolesAccounts = ResultFn(async function* (
  params: GetNameRolesAccountsParameters,
) {
  const client = yield* safeGetClient()

  const result = yield* await fromPromise(
    ensjs_getNameRoleAccounts(client, params),
    (e) =>
      new GetNameRolesAccountsError({
        cause: e as GetNameRolesAccountsErrorType,
      }),
  )

  return ok(result as GetNameRolesAccountsReturnType)
})

export const getNameRolesAccountsQueryKey = createQueryKey<
  'get-name-roles-accounts',
  GetNameRolesAccountsParameters
>('get-name-roles-accounts')

export const getNameRolesAccountsQueryOptions = (
  params: GetNameRolesAccountsParameters,
) =>
  resultQueryOptions({
    queryKey: getNameRolesAccountsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameRolesAccounts(params),
  })
