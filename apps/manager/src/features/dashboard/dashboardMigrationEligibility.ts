import type {
  ClassifiedName,
  IneligibleName,
} from '@/features/migration/service/classifyNames'

/** Namehashes of the ENSv1 names an upgrade can move. */
export const getMigrationEligibleKeys = ({
  classified,
  gracePeriodNames,
  eligibility,
}: {
  readonly classified: readonly ClassifiedName[]
  readonly gracePeriodNames: readonly IneligibleName[]
  readonly eligibility:
    | {
        readonly eligible: readonly ClassifiedName[]
        readonly needsWrapperSync: readonly ClassifiedName[]
        readonly verifiedSubnames: readonly ClassifiedName[]
      }
    | undefined
}): ReadonlySet<string> =>
  new Set(
    [
      ...(eligibility?.eligible ?? classified),
      ...(eligibility?.needsWrapperSync ?? []),
      ...(eligibility?.verifiedSubnames ?? []),
      ...gracePeriodNames,
    ].map(({ domain }) => domain.id.toLowerCase()),
  )
