import { match, P } from 'ts-pattern'

export type RegistryWarning = 'untrusted' | 'affected'

/** A registry check's answer once read, or where its read stands. */
export type RegistryCheck = boolean | 'pending' | 'failed'

/** Cached data wins over a failed refetch; no data and no error is still pending. */
export const toRegistryCheck = ({
  data,
  isError,
}: {
  readonly data: boolean | undefined
  readonly isError: boolean
}): RegistryCheck => data ?? (isError ? 'failed' : 'pending')

/** The one warning a registry page shows: untrusted outranks affected; a pending or failed affected check, or a switched-off affected warning, shows nothing. */
export const selectRegistryWarning = ({
  untrusted,
  affected,
  isAffectedWarningOn,
}: {
  readonly untrusted: RegistryCheck
  readonly affected: RegistryCheck
  readonly isAffectedWarningOn: boolean
}): RegistryWarning | null =>
  match({ untrusted, affected, isAffectedWarningOn })
    .returnType<RegistryWarning | null>()
    .with({ untrusted: true }, () => 'untrusted')
    // Waits on a pending untrusted check, so an untrusted registry never flashes the affected banner first.
    .with(
      {
        untrusted: P.union(false, 'failed'),
        affected: true,
        isAffectedWarningOn: true,
      },
      () => 'affected',
    )
    .otherwise(() => null)
