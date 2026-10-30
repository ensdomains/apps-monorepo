/**
 * - `resolver-not-contract`: the resolver is an address with no code, so every record write would fail.
 * - `resolver-locked`: the resolver refuses this wallet, and burnt fuses leave no way to change it.
 */
export type RecordEditLock = 'resolver-not-contract' | 'resolver-locked'

type RecoveryFuses = {
  readonly cannotSetResolver: boolean
  readonly cannotUnwrap: boolean
}

/** Only a definite `false` locks: unknown writability leaves editing open. */
export const getRecordEditLock = ({
  hasResolverCode,
  fuses,
  canWriteOnResolver,
}: {
  readonly hasResolverCode: boolean | undefined
  readonly fuses: RecoveryFuses | undefined
  readonly canWriteOnResolver: boolean | undefined
}): RecordEditLock | undefined => {
  if (hasResolverCode === false) return 'resolver-not-contract'
  return fuses?.cannotSetResolver &&
    fuses.cannotUnwrap &&
    canWriteOnResolver === false
    ? 'resolver-locked'
    : undefined
}
