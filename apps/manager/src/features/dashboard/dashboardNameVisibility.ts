import type { NameSummary } from '@ens-apps/indexer/reads'
import { fromPromise, okAsync, type ResultAsync } from 'neverthrow'

export type ReadDashboardNameVisibility = (
  name: NameSummary,
) => ResultAsync<boolean, never>

/** Registry authority alone does not make an ENSv2 name manageable here. */
export const getDashboardNameVisibility =
  (
    canWriteRecords: (name: string) => Promise<boolean>,
  ): ReadDashboardNameVisibility =>
  (name) => {
    if (name.protocol !== 'v2' || name.relations.includes('owner')) {
      return okAsync(true)
    }

    // A failed read cannot establish that this is a registry-only manager.
    return fromPromise(canWriteRecords(name.name), () => null).orElse(() =>
      okAsync(true),
    )
  }
