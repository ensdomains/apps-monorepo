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
import type { Address, Hex } from 'viem'
import { getSubnamesCount } from '@/features/profile/hooks/useSubnames'
import { getV1NameState } from '@/features/transfer/v1/getV1NameState'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getV1SubnameParentGate } from '../utils/create-subname.helpers'
import {
  getV1SubnameDeleteGate,
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

export interface PrepareDeleteV1SubnameSubmitParams {
  readonly parentName: string
  readonly labelhash: Hex
  readonly labelName: string | null
  readonly account: Address
  /** The write the table queued, from the indexer's view of the subname. */
  readonly target: V1SubnameDeleteTarget
}

/**
 * The checks run before a delete is signed. The table's rows come from the
 * indexer, so this re-reads the parent and the subname on-chain, and the
 * subname's own subnames, and refuses unless the queued write still applies.
 */
export const prepareDeleteV1SubnameSubmit = ResultFn(async function* ({
  parentName,
  labelhash,
  labelName,
  account,
  target,
}: PrepareDeleteV1SubnameSubmitParams) {
  // Built from the row's labelhash, not its served name: a label written as
  // `[<hex>]` would otherwise hash to another node (WEB-1458).
  const subname = `${encodeLabelhash(labelhash)}.${parentName}`
  const shown = labelName ? `${labelName}.${parentName}` : subname
  const fail =
    (message: string) => (cause: PrepareDeleteV1SubnameSubmitCause) =>
      new PrepareDeleteV1SubnameSubmitError({ message, cause })
  const refuse = (message: string, cause: PrepareDeleteV1SubnameSubmitCause) =>
    err(fail(message)(cause))

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
  const count = yield* getSubnamesCount({
    name: subname,
    protocolVersion: 'ENSv1',
  }).mapErr(fail(`Could not check ${shown}`))

  const gate = getV1SubnameDeleteGate(parentGate.parent, {
    labelName,
    wrapping:
      owner.ownershipLevel !== 'nameWrapper'
        ? { isWrapped: false }
        : wrapped && {
            isWrapped: true,
            parentCannotControl: wrapped.fuses.parent.PARENT_CANNOT_CONTROL,
          },
    subnameCount: count ?? undefined,
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
  return ok(gate.target)
})
