import { normalizeEthName } from '@/features/profile/service/profileName'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'

/** Imported DNS names are also served by the v1 registry but stay editable. */
export const canEditProfileHere = ({
  canEditRecords,
  isInGrace,
  isUpgradeRequired,
  name,
  protocol,
}: {
  readonly canEditRecords: boolean | undefined
  readonly isInGrace: boolean
  readonly isUpgradeRequired: boolean
  readonly name: string
  readonly protocol: RenewalProtocol | undefined
}) =>
  Boolean(canEditRecords) &&
  !isInGrace &&
  !isUpgradeRequired &&
  (protocol !== 'v1' || normalizeEthName(name) === null)
