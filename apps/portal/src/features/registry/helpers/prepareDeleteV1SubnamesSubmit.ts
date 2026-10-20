import {
  type InferErrTypes,
  ResultFn,
  TaggedError,
} from '@ens-apps/utils/neverthrow'
import {
  type GetOwnerErrorType as ensjsv1_GetOwnerErrorType,
  type GetWrapperDataErrorType as ensjsv1_GetWrapperDataErrorType,
  getOwner as ensjsv1_getOwner,
  getWrapperData as ensjsv1_getWrapperData,
} from '@ensdomains/ensjs/public/v1'
import { encodeLabelhash } from '@ensdomains/ensjs/utils'
import { err, fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { getSubnamesCount } from '@/features/profile/hooks/useSubnames'
import type { V1ParentState } from '@/features/transfer/types'
import { getV1NameState } from '@/features/transfer/v1/getV1NameState'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getV1SubnameParentGate } from '../utils/create-subname.helpers'
import {
  getV1SubnameDeleteGate,
  type V1SubnameDelete,
  type V1SubnameDeleteGate,
  type V1SubnameDeleteTarget,
} from '../utils/delete-v1-subname.helpers'

export type PrepareDeleteV1SubnameSubmitCause =
  | { readonly kind: 'already-deleted' }
  | {
      readonly kind: 'refused'
      readonly reason:
        | Exclude<V1SubnameDeleteGate['reason'], 'ok'>
        | 'grace'
        | 'unowned'
        | 'not-holder'
    }
  /** The subname changed since the table loaded: a different write is needed now. */
  | { readonly kind: 'changed'; readonly target: V1SubnameDeleteTarget }
  | ensjsv1_GetOwnerErrorType
  | ensjsv1_GetWrapperDataErrorType
  | InferErrTypes<
      ReturnType<
        typeof safeGetClient | typeof getV1NameState | typeof getSubnamesCount
      >
    >

export class PrepareDeleteV1SubnameSubmitError extends TaggedError(
  'PrepareDeleteV1SubnameSubmitError',
)<{
  message: string
  cause: PrepareDeleteV1SubnameSubmitCause
}> {}

export interface PrepareDeleteV1SubnamesSubmitParams {
  readonly parentName: string
  readonly account: Address
  /** The queued deletes, each with the write the table chose from the indexer's view. */
  readonly deletes: readonly Pick<
    V1SubnameDelete,
    'labelhash' | 'labelName' | 'target'
  >[]
}

const fail = (message: string) => (cause: PrepareDeleteV1SubnameSubmitCause) =>
  new PrepareDeleteV1SubnameSubmitError({ message, cause })
const refuse = (message: string, cause: PrepareDeleteV1SubnameSubmitCause) =>
  err(fail(message)(cause))

/** One subname's re-check, under a parent the caller already holds. */
const checkSubname = ResultFn(async function* (
  parentName: string,
  parent: V1ParentState,
  {
    labelhash,
    labelName,
    target,
  }: PrepareDeleteV1SubnamesSubmitParams['deletes'][number],
) {
  // Built from the row's labelhash, not its served name: a label written as
  // `[<hex>]` would otherwise hash to another node (WEB-1458).
  const subname = `${encodeLabelhash(labelhash)}.${parentName}`
  const shown = labelName ? `${labelName}.${parentName}` : subname

  const client = yield* safeGetClient().mapErr(fail('Failed to get client'))
  const owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name: subname }),
    (e) => e as ensjsv1_GetOwnerErrorType,
  ).mapErr(fail(`Could not check ${shown}`))
  if (!owner) {
    return refuse(`${shown} is already deleted.`, { kind: 'already-deleted' })
  }

  const wrapped =
    owner.ownershipLevel === 'nameWrapper'
      ? yield* fromPromise(
          ensjsv1_getWrapperData(client, { name: subname }),
          (e) => e as ensjsv1_GetWrapperDataErrorType,
        ).mapErr(fail(`Could not check ${shown}`))
      : null
  const subnameCount = yield* getSubnamesCount({
    name: subname,
    protocolVersion: 'ENSv1',
  }).mapErr(fail(`Could not check ${shown}`))

  const gate = getV1SubnameDeleteGate(parent, {
    labelName,
    wrapping:
      owner.ownershipLevel !== 'nameWrapper'
        ? { isWrapped: false }
        : wrapped && {
            isWrapped: true,
            parentCannotControl: wrapped.fuses.parent.PARENT_CANNOT_CONTROL,
          },
    subnameCount,
  })
  if (gate.reason !== 'ok') {
    return refuse(`${shown} can’t be deleted.`, {
      kind: 'refused',
      reason: gate.reason,
    })
  }
  if (gate.target !== target) {
    return refuse(
      `${shown} changed since the list loaded. Refresh and try again.`,
      { kind: 'changed', target: gate.target },
    )
  }
  return ok(undefined)
})

/**
 * The checks run before the delete modal opens. The table's rows come from
 * the indexer, so this re-reads the parent once and each subname on-chain, with
 * its own subnames, and refuses unless every queued write still applies.
 */
export const prepareDeleteV1SubnamesSubmit = ResultFn(async function* ({
  parentName,
  account,
  deletes,
}: PrepareDeleteV1SubnamesSubmitParams) {
  const state = yield* getV1NameState({ name: parentName }).mapErr(
    fail(`Could not check ${parentName}`),
  )
  const parentGate = state
    ? getV1SubnameParentGate(state, account)
    : ({ reason: 'unowned' } as const)
  if (parentGate.reason !== 'ok') {
    return refuse(`You can’t delete subnames of ${parentName}.`, {
      kind: 'refused',
      reason: parentGate.reason,
    })
  }
  for (const entry of deletes) {
    yield* checkSubname(parentName, parentGate.parent, entry)
  }
  return ok(undefined)
})
