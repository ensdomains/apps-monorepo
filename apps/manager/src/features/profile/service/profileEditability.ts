import { normalizeEthName } from '@/features/profile/service/profileName'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'

/** Imported DNS names are also served by the v1 registry but stay editable. */
export const canEditProfileHere = ({
  isInGrace,
  isOwner,
  isUpgradeRequired,
  name,
  protocol,
}: {
  readonly isInGrace: boolean
  readonly isOwner: boolean | undefined
  readonly isUpgradeRequired: boolean
  readonly name: string
  readonly protocol: RenewalProtocol | undefined
}) =>
  Boolean(isOwner) &&
  !isInGrace &&
  !isUpgradeRequired &&
  (protocol !== 'v1' || normalizeEthName(name) === null)
