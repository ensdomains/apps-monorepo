import { normalizeEthName } from '@/features/profile/service/profileName'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'

/** Imported DNS names are also served by the v1 registry but stay editable. */
export const canEditProfileHere = ({
  canEditRecords,
  hasRecords,
  isInGrace,
  isUpgradeRequired,
  name,
  protocol,
}: {
  readonly canEditRecords: boolean | undefined
  /** Unknown records must not seed an editor that would overwrite them. */
  readonly hasRecords: boolean
  readonly isInGrace: boolean
  readonly isUpgradeRequired: boolean
  readonly name: string
  readonly protocol: RenewalProtocol | undefined
}) =>
  Boolean(canEditRecords) &&
  hasRecords &&
  !isInGrace &&
  !isUpgradeRequired &&
  (protocol !== 'v1' || normalizeEthName(name) === null)
