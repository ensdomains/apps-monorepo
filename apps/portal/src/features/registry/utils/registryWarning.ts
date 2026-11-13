import { match } from 'ts-pattern'

export type RegistryWarning = 'untrusted' | 'affected'

/**
 * The one warning a registry page shows. Untrusted outranks affected, and a
 * check that is still loading or failed shows nothing.
 */
export const selectRegistryWarning = ({
  isUntrusted,
  isPendingUpgrade,
}: {
  readonly isUntrusted: boolean | undefined
  readonly isPendingUpgrade: boolean | undefined
}): RegistryWarning | null =>
  match({ isUntrusted, isPendingUpgrade })
    .returnType<RegistryWarning | null>()
    .with({ isUntrusted: true }, () => 'untrusted')
    // Waits for the untrusted check too, so an untrusted registry never flashes the affected banner first.
    .with({ isUntrusted: false, isPendingUpgrade: true }, () => 'affected')
    .otherwise(() => null)
