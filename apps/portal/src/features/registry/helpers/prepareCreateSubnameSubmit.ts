import {
  type InferErrTypes,
  ResultFn,
  TaggedError,
} from '@ens-apps/utils/neverthrow'
import {
  type GetResolverErrorType,
  getResolver,
} from '@ensdomains/ensjs/public'
import { err, fromPromise, ok } from 'neverthrow'
import {
  type GetIsV1SubnameTakenError,
  getIsV1SubnameTaken,
} from '@/features/profile/hooks/useSubnames'
import { safeGetClient } from '@/lib/wagmi/helpers'
import type {
  CreateSubnameTarget,
  CreateSubnameWrite,
} from '../utils/create-subname.helpers'

export type PrepareCreateSubnameSubmitCause =
  | { readonly kind: 'subnameTaken'; readonly subname: string }
  | { readonly kind: 'parentResolverNotFound'; readonly parentName: string }
  | GetIsV1SubnameTakenError
  | InferErrTypes<ReturnType<typeof safeGetClient>>
  | GetResolverErrorType

export class PrepareCreateSubnameSubmitError extends TaggedError(
  'PrepareCreateSubnameSubmitError',
)<{
  message: string
  cause: PrepareCreateSubnameSubmitCause
}> {}

export interface PrepareCreateSubnameSubmitParams {
  /** The parent name */
  readonly name: string
  readonly label: string
  readonly target: CreateSubnameTarget
}

/**
 * The checks the create form runs before signing. V1 rechecks the label:
 * `setSubnodeRecord` overwrites an existing subname. V2 reads the parent's
 * resolver for the new subname.
 */
export const prepareCreateSubnameSubmit = ResultFn(async function* ({
  name,
  label,
  target,
}: PrepareCreateSubnameSubmitParams) {
  if (target.protocol === 'ENSv1') {
    const subname = `${label}.${name}`
    const isTaken = yield* getIsV1SubnameTaken({ name, label }).mapErr(
      (cause) =>
        new PrepareCreateSubnameSubmitError({
          message: `Could not check whether ${subname} is already registered`,
          cause,
        }),
    )
    if (isTaken) {
      return err(
        new PrepareCreateSubnameSubmitError({
          message: `${subname} is already registered.`,
          cause: { kind: 'subnameTaken', subname },
        }),
      )
    }
    return ok<CreateSubnameWrite>(target)
  }

  const client = yield* safeGetClient().mapErr(
    (cause) =>
      new PrepareCreateSubnameSubmitError({
        message: 'Failed to get client',
        cause,
      }),
  )
  const resolverAddress = yield* fromPromise(
    getResolver(client, { name }),
    (cause) =>
      new PrepareCreateSubnameSubmitError({
        message: 'Failed to get resolver',
        cause: cause as GetResolverErrorType,
      }),
  )
  if (!resolverAddress) {
    return err(
      new PrepareCreateSubnameSubmitError({
        message: 'No resolver found for parent name',
        cause: { kind: 'parentResolverNotFound', parentName: name },
      }),
    )
  }
  return ok<CreateSubnameWrite>({ ...target, resolverAddress })
})
