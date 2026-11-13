export type ConfirmationAction = 'start' | 'retry'

/**
 * Whether the upgrade can go ahead without opening the subname dialog: a fresh
 * check found nothing lost or left behind, and no included subnames still need
 * explaining. A retry skips the explanation, which the owner saw before the first start.
 */
export const canSkipSubnameDialog = ({
  action,
  isReady,
  affectedCount,
  unrecoverableCount,
  hasIncludedSubnames,
}: {
  readonly action: ConfirmationAction
  readonly isReady: boolean
  readonly affectedCount: number | undefined
  /** Unknown-label subnames are dropped, which needs an acknowledgement every time. */
  readonly unrecoverableCount: number | undefined
  readonly hasIncludedSubnames: boolean
}): boolean =>
  isReady &&
  affectedCount === 0 &&
  unrecoverableCount === 0 &&
  (action === 'retry' || !hasIncludedSubnames)
