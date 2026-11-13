import { match, P } from 'ts-pattern'
import type { RegistryOccupants } from '../hooks/useRegistryOccupants'

/** How the connected account relates to a registry that needs an update, which decides the notice it sees. */
export type RegistryRepairCase =
  | 'unaffected'
  | 'unknown'
  | 'owns-all'
  | 'shared'
  | 'viewer'

export const getRegistryRepairCase = ({
  isPendingUpgrade,
  isConnected,
  canRepair,
  occupants,
}: {
  readonly isPendingUpgrade: boolean | undefined
  readonly isConnected: boolean
  /** The account can point the parent name at a replacement registry. */
  readonly canRepair: boolean | undefined
  /** The registry's subnames relative to the account; null when bigname can't count them. */
  readonly occupants: RegistryOccupants | null | undefined
}): RegistryRepairCase =>
  match({ isPendingUpgrade, isConnected, canRepair, occupants })
    .with({ isPendingUpgrade: false }, () => 'unaffected' as const)
    .with({ isPendingUpgrade: undefined }, () => 'unknown' as const)
    .with({ isConnected: false }, () => 'viewer' as const)
    .with({ canRepair: false }, () => 'viewer' as const)
    .with(
      P.union({ canRepair: undefined }, { occupants: P.nullish }),
      () => 'unknown' as const,
    )
    .with({ occupants: { thirdPartyCount: 0 } }, () => 'owns-all' as const)
    .otherwise(() => 'shared' as const)
