import { match } from 'ts-pattern'
import type { RecordEditLock } from './recordEditLock'

/**
 * Whether the connected wallet may edit records, from what the permission
 * reads settled on. Anything but a definite "yes" refuses.
 */
export const canEditRecords = ({
  isSettled,
  isPermissioned,
  isV2,
  hasGrant,
  canWriteOnResolver,
  isOwner,
  editLock,
}: {
  /** Every read has answered, a wallet is connected, and the name owns its resolver. */
  readonly isSettled: boolean
  readonly isPermissioned: boolean
  readonly isV2: boolean
  /** A root role or argument-scoped grant on a permissioned resolver. */
  readonly hasGrant: boolean
  /** The V2 non-permissioned resolver's answer for this wallet. */
  readonly canWriteOnResolver: boolean | undefined
  readonly isOwner: boolean
  readonly editLock: RecordEditLock | undefined
}): boolean =>
  match({ isSettled, isPermissioned, isV2, editLock })
    .with({ isSettled: false }, () => false)
    // Every write probe "succeeds" against an account with no code, so this
    // has to override the permissioned and V2 answers too.
    .with({ editLock: 'resolver-not-contract' }, () => false)
    .with({ isPermissioned: true }, () => hasGrant)
    .with({ isV2: true }, () => canWriteOnResolver === true)
    .otherwise(() => isOwner && !editLock)
