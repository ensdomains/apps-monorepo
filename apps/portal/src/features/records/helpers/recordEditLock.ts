/** `resolver-locked`: the resolver refuses this wallet, and burnt fuses leave no way to change it. */
export type RecordEditLock = 'resolver-locked'

type RecoveryFuses = {
  readonly cannotSetResolver: boolean
  readonly cannotUnwrap: boolean
}

/** Only a definite `false` locks: unknown writability leaves editing open. */
export const getRecordEditLock = ({
  fuses,
  canWriteOnResolver,
}: {
  readonly fuses: RecoveryFuses | undefined
  readonly canWriteOnResolver: boolean | undefined
}): RecordEditLock | undefined =>
  fuses?.cannotSetResolver && fuses.cannotUnwrap && canWriteOnResolver === false
    ? 'resolver-locked'
    : undefined
